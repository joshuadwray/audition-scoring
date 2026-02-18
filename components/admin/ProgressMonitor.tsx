'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase/client';
import { subscribeToSubmissions, subscribeToGroupUpdates } from '@/lib/realtime/admin-subscriptions';
import type { Dancer, DancerGroup, Judge, Material } from '@/lib/database.types';
import { getMaterialColorByName } from '@/lib/material-colors';

interface InstanceWithMaterial extends DancerGroup {
  materialName: string;
}

interface ProgressMonitorProps {
  sessionId: string;
  token: string;
}

interface InstanceStatus {
  instance: InstanceWithMaterial;
  totalJudges: number;
  completedJudges: number;
  submittedJudgeNames: string[];
}

interface TemplateData {
  template: DancerGroup;
  instances: InstanceStatus[];
}

export default function ProgressMonitor({ sessionId, token }: ProgressMonitorProps) {
  const [templates, setTemplates] = useState<TemplateData[]>([]);
  const [judges, setJudges] = useState<Judge[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [dancerMap, setDancerMap] = useState<Record<string, Dancer>>({});
  const [pushing, setPushing] = useState<string | null>(null);
  const [pushMaterial, setPushMaterial] = useState<Record<string, string>>({});
  const [expandedTemplates, setExpandedTemplates] = useState<Set<string>>(new Set());
  const [retracting, setRetracting] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    const [groupRes, judgeRes, materialRes, dancerRes] = await Promise.all([
      supabase
        .from('dancer_groups')
        .select('*, materials(name)')
        .eq('session_id', sessionId)
        .order('group_number'),
      supabase
        .from('judges')
        .select('*')
        .eq('session_id', sessionId)
        .eq('is_active', true),
      supabase
        .from('materials')
        .select('*')
        .eq('session_id', sessionId),
      supabase
        .from('dancers')
        .select('*')
        .eq('session_id', sessionId)
        .order('dancer_number'),
    ]);

    const allGroups = (groupRes.data || []) as (DancerGroup & { materials?: { name: string } | null })[];
    const judgeData = (judgeRes.data || []) as Judge[];
    const materialData = (materialRes.data || []) as Material[];
    const dancerData = (dancerRes.data || []) as Dancer[];
    setJudges(judgeData);
    setMaterials(materialData);

    // Build dancer lookup map
    const dMap: Record<string, Dancer> = {};
    for (const d of dancerData) dMap[d.id] = d;
    setDancerMap(dMap);

    // Partition into templates and instances (exclude archived)
    const templateGroups = allGroups.filter(g => g.material_id === null && !g.is_archived);
    const instanceGroups = allGroups.filter(g => g.material_id !== null && !g.is_archived);

    // Load submissions for instances
    const instanceStatuses: Record<string, InstanceStatus> = {};
    for (const inst of instanceGroups) {
      const { data: submissions } = await supabase
        .from('score_submissions')
        .select('judge_id')
        .eq('group_id', inst.id);

      const submittedJudgeIds = new Set((submissions || []).map(s => s.judge_id));
      const submittedJudgeNames = judgeData
        .filter(j => submittedJudgeIds.has(j.id))
        .map(j => j.name);

      instanceStatuses[inst.id] = {
        instance: {
          ...inst,
          materialName: inst.materials?.name || 'Unknown',
        },
        totalJudges: judgeData.length,
        completedJudges: submittedJudgeIds.size,
        submittedJudgeNames,
      };
    }

    // Group instances by group_number under their template
    const templateDataList: TemplateData[] = templateGroups.map(t => {
      const relatedInstances = instanceGroups
        .filter(i => i.group_number === t.group_number)
        .map(i => instanceStatuses[i.id])
        .filter(Boolean);

      return {
        template: t,
        instances: relatedInstances,
      };
    });

    setTemplates(templateDataList);
  }, [sessionId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Realtime subscriptions
  useEffect(() => {
    const subChannel = subscribeToSubmissions(sessionId, () => {
      loadData();
    });

    const groupChannel = subscribeToGroupUpdates(sessionId, () => {
      loadData();
    });

    return () => {
      supabase.removeChannel(subChannel);
      supabase.removeChannel(groupChannel);
    };
  }, [sessionId, loadData]);

  const handlePush = async (templateId: string) => {
    const materialId = pushMaterial[templateId];
    if (!materialId) return;

    setPushing(templateId);
    try {
      const res = await fetch(`/api/groups/${templateId}/push`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ materialId }),
      });

      if (!res.ok) {
        const err = await res.json();
        alert(err.error || 'Failed to push group');
      } else {
        // Auto-expand the template to show the new instance
        setExpandedTemplates(prev => new Set(prev).add(templateId));
      }

      loadData();
    } catch {
      alert('Failed to push group');
    } finally {
      setPushing(null);
    }
  };

  const toggleExpand = (templateId: string) => {
    setExpandedTemplates(prev => {
      const next = new Set(prev);
      if (next.has(templateId)) {
        next.delete(templateId);
      } else {
        next.add(templateId);
      }
      return next;
    });
  };

  const handleRetract = async (instanceId: string, completedJudges: number) => {
    if (!confirm('Retract this group? Judges will lose access immediately.')) return;

    let deleteScores = false;
    if (completedJudges > 0) {
      deleteScores = confirm('Scores exist for this group. Delete scores too?\n\nOK = Delete scores\nCancel = Keep scores');
    }

    setRetracting(instanceId);
    try {
      const res = await fetch(`/api/groups/${instanceId}/retract`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ deleteScores }),
      });

      if (!res.ok) {
        const err = await res.json();
        alert(err.error || 'Failed to retract group');
      }

      loadData();
    } catch {
      alert('Failed to retract group');
    } finally {
      setRetracting(null);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'queued':
        return <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-gray-100 text-gray-600">Queued</span>;
      case 'active':
        return <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-blue-100 text-blue-700">Active</span>;
      case 'completed':
        return <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-green-100 text-green-700">Complete</span>;
      case 'retracted':
        return <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-red-100 text-red-700">Retracted</span>;
      default:
        return null;
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-semibold text-gray-900">Groups</h3>
        <span className="text-sm text-gray-500">{judges.length} active judges</span>
      </div>

      {templates.length === 0 ? (
        <div className="text-center py-8 text-gray-400 text-sm">
          No groups created yet. Go to Setup to create groups.
        </div>
      ) : (
        <div className="space-y-3">
          {templates.map(({ template, instances }) => {
            const isExpanded = expandedTemplates.has(template.id);

            return (
              <div key={template.id} className="bg-white border border-gray-200 rounded-lg">
                {/* Template header */}
                <div className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-gray-900">Group {template.group_number}</span>
                        <span className="text-xs text-gray-500">{template.dancer_ids.length} dancers</span>
                        {instances.length > 0 && (
                          <button
                            onClick={() => toggleExpand(template.id)}
                            className="text-xs text-blue-500 hover:text-blue-700"
                          >
                            {instances.length} push{instances.length !== 1 ? 'es' : ''} {isExpanded ? '▼' : '▶'}
                          </button>
                        )}
                      </div>
                      {template.dancer_ids.length > 0 && (
                        <div className="text-xs text-gray-400 mt-0.5 truncate">
                          {template.dancer_ids
                            .map(id => dancerMap[id] ? `#${dancerMap[id].dancer_number} ${dancerMap[id].name}` : null)
                            .filter(Boolean)
                            .join(', ')}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Push controls - always visible since templates are reusable */}
                  <div className="flex gap-2 items-center">
                    <select
                      value={pushMaterial[template.id] || ''}
                      onChange={e => setPushMaterial(prev => ({ ...prev, [template.id]: e.target.value }))}
                      className="flex-1 px-3 py-1.5 border border-gray-300 rounded-md text-sm"
                    >
                      <option value="">Select material...</option>
                      {materials.map(m => (
                        <option key={m.id} value={m.id}>{m.name}</option>
                      ))}
                    </select>
                    <button
                      onClick={() => handlePush(template.id)}
                      disabled={pushing === template.id || !pushMaterial[template.id]}
                      className="px-4 py-1.5 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 disabled:bg-gray-300 whitespace-nowrap"
                    >
                      {pushing === template.id ? 'Pushing...' : 'Push'}
                    </button>
                  </div>
                </div>

                {/* Instance history (collapsible) */}
                {isExpanded && instances.length > 0 && (
                  <div className="border-t border-gray-100 divide-y divide-gray-50">
                    {instances.map(({ instance, totalJudges, completedJudges, submittedJudgeNames }) => {
                      const progressPercent = totalJudges > 0
                        ? (completedJudges / totalJudges) * 100
                        : 0;

                      return (
                        <div key={instance.id} className="px-4 py-3 bg-gray-50/50">
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-2">
                              <span className={`text-sm font-medium px-2 py-0.5 rounded-full ${getMaterialColorByName(instance.materialName, materials).bg} ${getMaterialColorByName(instance.materialName, materials).text}`}>{instance.materialName}</span>
                              {getStatusBadge(instance.status)}
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-gray-500">{completedJudges}/{totalJudges} judges</span>
                              {instance.status === 'active' && (
                                <button
                                  onClick={() => handleRetract(instance.id, completedJudges)}
                                  disabled={retracting === instance.id}
                                  className="text-xs px-2 py-0.5 text-red-600 hover:bg-red-50 rounded disabled:text-gray-400"
                                  title="Retract this push"
                                >
                                  {retracting === instance.id ? 'Retracting...' : 'Retract'}
                                </button>
                              )}
                            </div>
                          </div>

                          <div className="w-full bg-gray-200 rounded-full h-1.5">
                            <div
                              className={`h-1.5 rounded-full transition-all ${progressPercent === 100 ? 'bg-green-500' : 'bg-blue-500'}`}
                              style={{ width: `${progressPercent}%` }}
                            />
                          </div>

                          {submittedJudgeNames.length > 0 && (
                            <div className="mt-1 text-xs text-gray-400">
                              Submitted: {submittedJudgeNames.join(', ')}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
