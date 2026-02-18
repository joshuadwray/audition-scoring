'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/supabase/client';
import DancerTile from './DancerTile';
import type { ScoreState, Dancer, Score, ScoreSubmission, DancerGroup, Material } from '@/lib/database.types';
import { getMaterialColorByName } from '@/lib/material-colors';

interface MyScoresViewProps {
  sessionId: string;
  judgeId: string;
  token: string;
  isLocked: boolean;
}

interface MaterialScore {
  materialName: string;
  groupId: string;
  scoreRecord: Score | null;
}

interface DancerEntry {
  dancer: Dancer;
  materials: MaterialScore[];
}

export default function MyScoresView({ sessionId, judgeId, token, isLocked }: MyScoresViewProps) {
  const [loading, setLoading] = useState(true);
  const [dancerEntries, setDancerEntries] = useState<DancerEntry[]>([]);
  const [editedScores, setEditedScores] = useState<Record<string, ScoreState>>({});
  const [savedScores, setSavedScores] = useState<Record<string, ScoreState>>({});
  const [expandedDancerId, setExpandedDancerId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isWide, setIsWide] = useState(false);
  const [materials, setMaterials] = useState<Material[]>([]);

  // Load materials for color assignment
  useEffect(() => {
    if (!sessionId) return;
    async function loadMaterials() {
      const { data } = await supabase
        .from('materials')
        .select('*')
        .eq('session_id', sessionId);
      setMaterials((data || []) as Material[]);
    }
    loadMaterials();
  }, [sessionId]);

  // Detect wide viewport for compact mode
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    setIsWide(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsWide(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  // Load all submitted scores for this judge
  const loadScores = useCallback(async () => {
    if (!judgeId) return;
    setLoading(true);

    try {
      // Get all submissions for this judge
      const { data: submissions } = await supabase
        .from('score_submissions')
        .select('*')
        .eq('judge_id', judgeId);

      if (!submissions || submissions.length === 0) {
        setDancerEntries([]);
        setLoading(false);
        return;
      }

      const groupIds = (submissions as ScoreSubmission[]).map(s => s.group_id);

      // Load groups with material names
      const { data: groups } = await supabase
        .from('dancer_groups')
        .select('*, materials(name)')
        .in('id', groupIds);

      if (!groups) {
        setLoading(false);
        return;
      }

      // Collect all dancer IDs from groups
      const allDancerIds = new Set<string>();
      for (const g of groups as (DancerGroup & { materials?: { name: string } | null })[]) {
        for (const did of g.dancer_ids) {
          allDancerIds.add(did);
        }
      }

      // Load all dancers
      const { data: dancerData } = await supabase
        .from('dancers')
        .select('*')
        .in('id', Array.from(allDancerIds))
        .order('name');

      // Load all scores for this judge in these groups
      const { data: scoreData } = await supabase
        .from('scores')
        .select('*')
        .eq('judge_id', judgeId)
        .in('group_id', groupIds);

      const dancerMap = new Map<string, Dancer>();
      for (const d of (dancerData || []) as Dancer[]) {
        dancerMap.set(d.id, d);
      }

      const scoreByDancerGroup = new Map<string, Score>();
      for (const s of (scoreData || []) as Score[]) {
        scoreByDancerGroup.set(`${s.dancer_id}_${s.group_id}`, s);
      }

      // Group by dancer — collect all materials per dancer
      const dancerMaterialsMap = new Map<string, { dancer: Dancer; materials: MaterialScore[] }>();
      const initialEdited: Record<string, ScoreState> = {};
      const initialSaved: Record<string, ScoreState> = {};

      for (const g of groups as (DancerGroup & { materials?: { name: string } | null })[]) {
        const materialName = g.materials?.name || 'Unknown';
        for (const dancerId of g.dancer_ids) {
          const dancer = dancerMap.get(dancerId);
          if (!dancer) continue;

          const score = scoreByDancerGroup.get(`${dancerId}_${g.id}`) || null;
          const scoreState: ScoreState = score ? {
            technique: score.technique ?? undefined,
            musicality: score.musicality ?? undefined,
            expression: score.expression ?? undefined,
            timing: score.timing ?? undefined,
            presentation: score.presentation ?? undefined,
          } : {};

          const key = `${dancerId}_${g.id}`;
          initialEdited[key] = { ...scoreState };
          initialSaved[key] = { ...scoreState };

          if (!dancerMaterialsMap.has(dancerId)) {
            dancerMaterialsMap.set(dancerId, { dancer, materials: [] });
          }
          dancerMaterialsMap.get(dancerId)!.materials.push({
            materialName,
            groupId: g.id,
            scoreRecord: score,
          });
        }
      }

      // Sort by dancer name
      const entries = Array.from(dancerMaterialsMap.values());
      entries.sort((a, b) => a.dancer.name.localeCompare(b.dancer.name));

      setDancerEntries(entries);
      setEditedScores(initialEdited);
      setSavedScores(initialSaved);
    } finally {
      setLoading(false);
    }
  }, [judgeId]);

  useEffect(() => {
    loadScores();
  }, [loadScores]);

  // Filter dancers by search query
  const filteredEntries = useMemo(() => {
    if (!searchQuery.trim()) return dancerEntries;
    const q = searchQuery.toLowerCase();
    return dancerEntries.filter(e =>
      e.dancer.name.toLowerCase().includes(q) ||
      String(e.dancer.dancer_number).includes(q)
    );
  }, [dancerEntries, searchQuery]);

  // Collect all score keys for dirty tracking
  const allScoreKeys = useMemo(() => {
    const keys: { key: string; dancerId: string }[] = [];
    for (const entry of dancerEntries) {
      for (const mat of entry.materials) {
        keys.push({ key: `${entry.dancer.id}_${mat.groupId}`, dancerId: entry.dancer.id });
      }
    }
    return keys;
  }, [dancerEntries]);

  // Track dirty state
  const dirtyKeys = useMemo(() => {
    const keys: string[] = [];
    const categories = ['technique', 'musicality', 'expression', 'timing', 'presentation'] as const;
    for (const { key } of allScoreKeys) {
      const edited = editedScores[key];
      const saved = savedScores[key];
      if (!edited || !saved) continue;
      for (const cat of categories) {
        if (edited[cat] !== saved[cat]) {
          keys.push(key);
          break;
        }
      }
    }
    return keys;
  }, [allScoreKeys, editedScores, savedScores]);

  const hasDirty = dirtyKeys.length > 0;

  // Check if a dancer has any dirty material scores
  const dancerHasDirty = useCallback((dancerId: string) => {
    return dirtyKeys.some(k => k.startsWith(`${dancerId}_`));
  }, [dirtyKeys]);

  const handleScoreChange = (dancerId: string, groupId: string, category: string, value: number) => {
    if (isLocked) return;
    const key = `${dancerId}_${groupId}`;
    setEditedScores(prev => ({
      ...prev,
      [key]: {
        ...prev[key],
        [category]: value,
      },
    }));
  };

  const handleSave = async () => {
    if (saving || !hasDirty) return;
    setSaving(true);
    setSaveMessage(null);

    let errorCount = 0;

    for (const key of dirtyKeys) {
      // Find the score record for this key
      let scoreRecord: Score | null = null;
      for (const entry of dancerEntries) {
        for (const mat of entry.materials) {
          if (`${entry.dancer.id}_${mat.groupId}` === key) {
            scoreRecord = mat.scoreRecord;
            break;
          }
        }
        if (scoreRecord) break;
      }

      if (!scoreRecord) continue;

      const edited = editedScores[key];
      const saved = savedScores[key];
      const updates: Partial<ScoreState> = {};
      const categories = ['technique', 'musicality', 'expression', 'timing', 'presentation'] as const;

      for (const cat of categories) {
        if (edited[cat] !== saved[cat]) {
          updates[cat] = edited[cat];
        }
      }

      if (Object.keys(updates).length === 0) continue;

      try {
        const res = await fetch(`/api/scores/${scoreRecord.id}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify(updates),
        });

        if (res.ok) {
          setSavedScores(prev => ({
            ...prev,
            [key]: { ...editedScores[key] },
          }));
        } else {
          errorCount++;
        }
      } catch {
        errorCount++;
      }
    }

    setSaving(false);
    if (errorCount === 0) {
      setSaveMessage({ type: 'success', text: 'All changes saved.' });
    } else {
      setSaveMessage({ type: 'error', text: `Failed to save ${errorCount} score(s). Try again.` });
    }

    setTimeout(() => setSaveMessage(null), 3000);
  };

  if (loading) {
    return (
      <div className="text-center py-12 text-gray-500">
        Loading scores...
      </div>
    );
  }

  if (dancerEntries.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500">
        <p>No scores submitted yet.</p>
      </div>
    );
  }

  return (
    <div className="pb-24">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">My Submitted Scores</h2>

      {isLocked && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg px-4 py-3 text-sm text-yellow-700 mb-4">
          Session locked. Scores are read-only.
        </div>
      )}

      {/* Search bar */}
      <div className="mb-4">
        <input
          type="text"
          placeholder="Search by dancer name or number..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        />
      </div>

      {/* Dancer list */}
      <div className="space-y-2">
        {filteredEntries.map(entry => {
          const isExpanded = expandedDancerId === entry.dancer.id;
          const isDirty = dancerHasDirty(entry.dancer.id);

          return (
            <div key={entry.dancer.id} className="bg-white border border-gray-200 rounded-lg overflow-hidden">
              <button
                onClick={() => setExpandedDancerId(isExpanded ? null : entry.dancer.id)}
                className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="font-mono font-bold text-gray-900">#{entry.dancer.dancer_number}</span>
                  <span className="text-gray-700">{entry.dancer.name}</span>
                  <div className="flex gap-1.5">
                    {entry.materials.map(mat => {
                      const color = getMaterialColorByName(mat.materialName, materials);
                      return (
                        <span key={mat.groupId} className={`px-2 py-0.5 ${color.bg} ${color.text} text-xs rounded-full`}>
                          {mat.materialName}
                        </span>
                      );
                    })}
                  </div>
                  {isDirty && (
                    <span className="px-2 py-0.5 bg-orange-50 text-orange-600 text-xs rounded-full">Unsaved</span>
                  )}
                </div>
                <svg
                  className={`w-5 h-5 text-gray-400 transition-transform flex-shrink-0 ${isExpanded ? 'rotate-180' : ''}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {isExpanded && (
                <div className="px-4 pb-4 border-t border-gray-100 mt-3">
                  <div className="flex gap-3 overflow-x-auto">
                    {entry.materials.map(mat => {
                      const key = `${entry.dancer.id}_${mat.groupId}`;
                      const color = getMaterialColorByName(mat.materialName, materials);
                      return (
                        <div key={mat.groupId} className="flex-shrink-0 w-64">
                          <DancerTile
                            dancer={entry.dancer}
                            scores={editedScores[key] || {}}
                            onScoreChange={(category, value) => handleScoreChange(entry.dancer.id, mat.groupId, category, value)}
                            isLocked={isLocked}
                            compact={isWide}
                            materialLabel={mat.materialName}
                            materialColorClasses={color}
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {filteredEntries.length === 0 && searchQuery && (
        <div className="text-center py-8 text-gray-400">
          No dancers match your search.
        </div>
      )}

      {/* Save Changes button */}
      {hasDirty && !isLocked && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-4 shadow-lg z-10">
          <div className="max-w-6xl mx-auto flex items-center justify-between">
            <span className="text-sm text-orange-600">{dirtyKeys.length} score(s) with unsaved changes</span>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-6 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:bg-gray-300 transition-colors"
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>
      )}

      {/* Save feedback message */}
      {saveMessage && (
        <div className={`fixed bottom-20 left-1/2 -translate-x-1/2 px-4 py-2 rounded-lg shadow-lg text-sm z-20 ${
          saveMessage.type === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
        }`}>
          {saveMessage.text}
        </div>
      )}
    </div>
  );
}
