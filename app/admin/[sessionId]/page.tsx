'use client';

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import SessionHeader from '@/components/shared/SessionHeader';
import DancerImport from '@/components/admin/DancerImport';
import ManualDancerAdd from '@/components/admin/ManualDancerAdd';
import GroupBuilder from '@/components/admin/GroupBuilder';
import ProgressMonitor from '@/components/admin/ProgressMonitor';
import AdHocGroupCreator from '@/components/admin/AdHocGroupCreator';
import ResultsTable from '@/components/admin/ResultsTable';
import DancerTile from '@/components/judge/DancerTile';
import GroupSubmitButton from '@/components/judge/GroupSubmitButton';
import MyScoresView from '@/components/judge/MyScoresView';
import { supabase } from '@/lib/supabase/client';
import { subscribeToGroupChanges } from '@/lib/realtime/judge-subscriptions';
import type { Dancer, Judge, Material, DancerGroup, DancerGroupWithMaterial, Session, ScoreState, ScoreCategory } from '@/lib/database.types';
import { SCORE_CATEGORIES } from '@/lib/database.types';
import { getMaterialColor } from '@/lib/material-colors';

type Tab = 'setup' | 'monitor' | 'results' | 'judge';

export default function AdminDashboard() {
  const params = useParams();
  const router = useRouter();
  const sessionId = params.sessionId as string;

  const [token, setToken] = useState('');
  const [session, setSession] = useState<Session | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('setup');
  const [dancers, setDancers] = useState<Dancer[]>([]);
  const [judges, setJudges] = useState<Judge[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [groups, setGroups] = useState<DancerGroup[]>([]);

  // Add judge form state
  const [newJudgeName, setNewJudgeName] = useState('');
  const [addingJudge, setAddingJudge] = useState(false);

  // Add material form state
  const [newMaterialName, setNewMaterialName] = useState('');
  const [addingMaterial, setAddingMaterial] = useState(false);

  // Admin-as-judge state
  const [adminJudgeId, setAdminJudgeId] = useState<string | null>(null);
  const [joiningAsJudge, setJoiningAsJudge] = useState(false);

  // Judge tab state
  const [judgeSubTab, setJudgeSubTab] = useState<'score' | 'my-scores'>('score');

  // Judge tab scoring state
  const [judgeActiveGroup, setJudgeActiveGroup] = useState<DancerGroupWithMaterial | null>(null);
  const [isWide, setIsWide] = useState(false);
  const [judgeDancers, setJudgeDancers] = useState<Dancer[]>([]);
  const [judgeLocalScores, setJudgeLocalScores] = useState<Record<string, ScoreState>>({});
  const [judgeIsSubmitting, setJudgeIsSubmitting] = useState(false);
  const [judgeIsSubmitted, setJudgeIsSubmitted] = useState(false);

  // Keyboard navigation state for judge tab
  const [judgeFocusedTileIndex, setJudgeFocusedTileIndex] = useState<number | null>(null);
  const [judgeFocusedCategoryIndex, setJudgeFocusedCategoryIndex] = useState<number | null>(null);
  const judgeTileRefs = useRef<(HTMLDivElement | null)[]>([]);

  // Build dancer lookup map for group list display
  const dancerMap = useMemo(() => {
    const map: Record<string, Dancer> = {};
    for (const d of dancers) map[d.id] = d;
    return map;
  }, [dancers]);

  useEffect(() => {
    const authToken = localStorage.getItem('auth_token');
    const role = localStorage.getItem('user_role');

    if (!authToken || role !== 'admin') {
      router.push('/');
      return;
    }

    setToken(authToken);

    // Check for existing admin judge ID in localStorage (scoped to session)
    const storedAdminJudgeId = localStorage.getItem(`admin_judge_id_${sessionId}`);
    if (storedAdminJudgeId) {
      setAdminJudgeId(storedAdminJudgeId);
    }
  }, [router]);

  const loadSession = useCallback(async () => {
    const { data } = await supabase
      .from('sessions')
      .select('*')
      .eq('id', sessionId)
      .single();
    if (data) setSession(data as Session);
  }, [sessionId]);

  const loadDancers = useCallback(async () => {
    const { data } = await supabase
      .from('dancers')
      .select('*')
      .eq('session_id', sessionId)
      .order('dancer_number');
    setDancers((data || []) as Dancer[]);
  }, [sessionId]);

  const loadJudges = useCallback(async () => {
    const { data } = await supabase
      .from('judges')
      .select('*')
      .eq('session_id', sessionId)
      .eq('is_active', true)
      .order('created_at');
    setJudges((data || []) as Judge[]);
  }, [sessionId]);

  const loadMaterials = useCallback(async () => {
    const { data } = await supabase
      .from('materials')
      .select('*')
      .eq('session_id', sessionId);
    setMaterials((data || []) as Material[]);
  }, [sessionId]);

  const loadGroups = useCallback(async () => {
    const { data } = await supabase
      .from('dancer_groups')
      .select('*')
      .eq('session_id', sessionId)
      .order('group_number');
    setGroups((data || []) as DancerGroup[]);
  }, [sessionId]);

  // Check if admin-judge record exists on load (always validate for current session)
  useEffect(() => {
    if (!token) return;

    async function checkAdminJudge() {
      const { data } = await supabase
        .from('judges')
        .select('id')
        .eq('session_id', sessionId)
        .eq('is_admin_judge', true)
        .eq('is_active', true)
        .single();

      if (data) {
        setAdminJudgeId(data.id);
        localStorage.setItem(`admin_judge_id_${sessionId}`, data.id);
      } else {
        setAdminJudgeId(null);
        localStorage.removeItem(`admin_judge_id_${sessionId}`);
      }
    }

    checkAdminJudge();
  }, [token, sessionId]);

  useEffect(() => {
    if (token) {
      loadSession();
      loadDancers();
      loadJudges();
      loadMaterials();
      loadGroups();
    }
  }, [token, loadSession, loadDancers, loadJudges, loadMaterials, loadGroups]);

  const handleAddJudge = async () => {
    if (!newJudgeName.trim()) return;
    setAddingJudge(true);

    try {
      await fetch('/api/judges', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ name: newJudgeName.trim(), sessionId }),
      });
      setNewJudgeName('');
      loadJudges();
    } catch {
      alert('Failed to add judge');
    } finally {
      setAddingJudge(false);
    }
  };

  const handleRemoveJudge = async (judgeId: string) => {
    try {
      await fetch(`/api/judges?id=${judgeId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` },
      });
      loadJudges();
    } catch {
      alert('Failed to remove judge');
    }
  };

  const handleAddMaterial = async () => {
    if (!newMaterialName.trim()) return;
    setAddingMaterial(true);

    try {
      const res = await fetch('/api/dancers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          _createMaterial: true,
          sessionId,
          materialName: newMaterialName.trim(),
        }),
      });

      if (res.ok) {
        setNewMaterialName('');
        loadMaterials();
      } else {
        alert('Failed to add material');
      }
    } catch {
      alert('Failed to add material');
    } finally {
      setAddingMaterial(false);
    }
  };

  const handleLockSession = async () => {
    if (!confirm('Lock this session? Judges will no longer be able to edit scores.')) return;

    try {
      await fetch(`/api/sessions/${sessionId}/lock`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
      });
      loadSession();
    } catch {
      alert('Failed to lock session');
    }
  };

  const handleUnlockSession = async () => {
    if (!confirm('Unlock session? Judges will be able to edit scores again.')) return;

    try {
      await fetch(`/api/sessions/${sessionId}/lock`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` },
      });
      loadSession();
    } catch {
      alert('Failed to unlock session');
    }
  };

  const handleActivateSession = async () => {
    try {
      await fetch(`/api/sessions/${sessionId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ status: 'active' }),
      });
      loadSession();
    } catch {
      alert('Failed to activate session');
    }
  };

  const handleDeleteDancer = async (dancerId: string, dancerNumber: number) => {
    try {
      const res = await fetch(`/api/dancers?id=${dancerId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` },
      });

      if (res.status === 409) {
        const data = await res.json();
        if (data.hasScores) {
          if (!confirm(`Dancer #${dancerNumber} has scores. Delete dancer and all their scores?`)) return;
          const forceRes = await fetch(`/api/dancers?id=${dancerId}&force=true`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` },
          });
          if (!forceRes.ok) {
            alert('Failed to delete dancer');
            return;
          }
        }
      } else if (!res.ok) {
        alert('Failed to delete dancer');
        return;
      }

      loadDancers();
    } catch {
      alert('Failed to delete dancer');
    }
  };

  const handleJoinAsJudge = async () => {
    setJoiningAsJudge(true);
    try {
      const res = await fetch('/api/judges', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ name: 'Admin', sessionId, isAdminJudge: true }),
      });

      if (!res.ok) {
        const err = await res.json();
        alert(err.error || 'Failed to join as judge');
        return;
      }

      const data = await res.json();
      setAdminJudgeId(data.id);
      localStorage.setItem(`admin_judge_id_${sessionId}`, data.id);

      // Use the new token returned by the API (includes judgeId)
      if (data.token) {
        setToken(data.token);
        localStorage.setItem('auth_token', data.token);
      }

      loadJudges();
      setActiveTab('judge');
    } catch {
      alert('Failed to join as judge');
    } finally {
      setJoiningAsJudge(false);
    }
  };

  // Judge tab: load active group
  // Detect wide viewport for compact judge tiles
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    setIsWide(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsWide(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const loadJudgeActiveGroup = useCallback(async () => {
    if (!adminJudgeId) return;

    const { data: activeGroups } = await supabase
      .from('dancer_groups')
      .select('*, materials(name)')
      .eq('session_id', sessionId)
      .eq('status', 'active')
      .order('pushed_at', { ascending: false })
      .limit(1);

    if (activeGroups && activeGroups.length > 0) {
      const group = activeGroups[0] as DancerGroupWithMaterial;
      setJudgeActiveGroup(group);

      // Check if already submitted
      const { data: submission } = await supabase
        .from('score_submissions')
        .select('id')
        .eq('group_id', group.id)
        .eq('judge_id', adminJudgeId)
        .single();

      setJudgeIsSubmitted(!!submission);

      // Load dancers
      if (group.dancer_ids.length > 0) {
        const { data: dancerData } = await supabase
          .from('dancers')
          .select('*')
          .in('id', group.dancer_ids)
          .order('dancer_number');

        setJudgeDancers((dancerData || []) as Dancer[]);
      }
    } else {
      setJudgeActiveGroup(null);
      setJudgeDancers([]);
    }
  }, [sessionId, adminJudgeId]);

  // Load active group when judge tab is selected
  useEffect(() => {
    if (activeTab === 'judge' && adminJudgeId) {
      loadJudgeActiveGroup();
    }
  }, [activeTab, adminJudgeId, loadJudgeActiveGroup]);

  // Realtime subscription for judge tab group pushes
  useEffect(() => {
    if (!adminJudgeId || activeTab !== 'judge') return;

    const channel = subscribeToGroupChanges(sessionId, (payload) => {
      const newGroup = payload.new as unknown as DancerGroup;
      if (newGroup.status === 'retracted' && judgeActiveGroup?.id === newGroup.id) {
        setJudgeActiveGroup(null);
        setJudgeLocalScores({});
        setJudgeDancers([]);
        setJudgeIsSubmitted(false);
        if (judgeActiveGroup?.id && adminJudgeId) {
          localStorage.removeItem(`scoring_draft_${judgeActiveGroup.id}_${adminJudgeId}`);
        }
      } else if (newGroup.status === 'active') {
        setJudgeIsSubmitted(false);
        setJudgeLocalScores({});
        loadJudgeActiveGroup();
      }
    });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [sessionId, adminJudgeId, activeTab, loadJudgeActiveGroup, judgeActiveGroup]);

  // Load/save judge draft from localStorage
  useEffect(() => {
    if (!judgeActiveGroup?.id || !adminJudgeId || judgeIsSubmitted) return;
    const draftKey = `scoring_draft_${judgeActiveGroup.id}_${adminJudgeId}`;
    const draft = localStorage.getItem(draftKey);
    if (draft) {
      try {
        setJudgeLocalScores(JSON.parse(draft));
      } catch { setJudgeLocalScores({}); }
    } else {
      setJudgeLocalScores({});
    }
  }, [judgeActiveGroup?.id, adminJudgeId, judgeIsSubmitted]);

  useEffect(() => {
    if (!judgeActiveGroup?.id || !adminJudgeId || judgeIsSubmitted) return;
    const draftKey = `scoring_draft_${judgeActiveGroup.id}_${adminJudgeId}`;
    localStorage.setItem(draftKey, JSON.stringify(judgeLocalScores));
  }, [judgeLocalScores, judgeActiveGroup?.id, adminJudgeId, judgeIsSubmitted]);

  // Keyboard navigation handler for judge tab
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only active on judge score sub-tab
      if (activeTab !== 'judge' || judgeSubTab !== 'score') return;
      // Skip when typing in inputs
      const tag = (document.activeElement?.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
      // Skip when no group, submitted, or locked
      if (!judgeActiveGroup || judgeIsSubmitted || session?.is_locked) return;

      if (e.key === 'Escape') {
        setJudgeFocusedTileIndex(null);
        setJudgeFocusedCategoryIndex(null);
        return;
      }

      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        setJudgeFocusedTileIndex(prev => {
          const max = judgeDancers.length - 1;
          if (prev === null) return 0;
          const next = e.key === 'ArrowLeft' ? prev - 1 : prev + 1;
          const clamped = Math.max(0, Math.min(max, next));
          setTimeout(() => judgeTileRefs.current[clamped]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 0);
          return clamped;
        });
        setJudgeFocusedCategoryIndex(prev => prev === null ? 0 : prev);
        return;
      }

      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
        if (judgeFocusedTileIndex === null) {
          setJudgeFocusedTileIndex(0);
          setJudgeFocusedCategoryIndex(0);
          return;
        }
        setJudgeFocusedCategoryIndex(prev => {
          if (prev === null) return 0;
          const next = e.key === 'ArrowUp' ? prev - 1 : prev + 1;
          return Math.max(0, Math.min(4, next));
        });
        return;
      }

      // Number keys 1-5 for scoring
      const num = parseInt(e.key, 10);
      if (num >= 1 && num <= 5 && judgeFocusedTileIndex !== null && judgeFocusedCategoryIndex !== null) {
        e.preventDefault();
        const dancer = judgeDancers[judgeFocusedTileIndex];
        if (!dancer) return;
        const category = SCORE_CATEGORIES[judgeFocusedCategoryIndex] as ScoreCategory;
        const currentValue = judgeLocalScores[dancer.id]?.[category];

        let shouldAdvance = false;
        if (currentValue === num) {
          if (num < 5) {
            handleJudgeScoreChange(dancer.id, category, num + 0.5);
          }
        } else if (currentValue === num + 0.5) {
          handleJudgeScoreChange(dancer.id, category, num);
        } else {
          handleJudgeScoreChange(dancer.id, category, num);
          shouldAdvance = true;
        }

        if (shouldAdvance) {
          if (judgeFocusedCategoryIndex < 4) {
            setJudgeFocusedCategoryIndex(judgeFocusedCategoryIndex + 1);
          } else if (judgeFocusedTileIndex < judgeDancers.length - 1) {
            const nextTile = judgeFocusedTileIndex + 1;
            setJudgeFocusedTileIndex(nextTile);
            setJudgeFocusedCategoryIndex(0);
            setTimeout(() => judgeTileRefs.current[nextTile]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 0);
          }
        }
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeTab, judgeSubTab, judgeActiveGroup, judgeIsSubmitted, session?.is_locked, judgeDancers, judgeFocusedTileIndex, judgeFocusedCategoryIndex, judgeLocalScores]);

  // Reset focus when group changes, submitted, or tab switches
  useEffect(() => {
    setJudgeFocusedTileIndex(null);
    setJudgeFocusedCategoryIndex(null);
  }, [judgeActiveGroup?.id, judgeIsSubmitted, activeTab, judgeSubTab]);

  const handleJudgeScoreChange = (dancerId: string, category: string, value: number) => {
    setJudgeLocalScores(prev => ({
      ...prev,
      [dancerId]: {
        ...prev[dancerId],
        [category]: value,
      },
    }));
  };

  const handleJudgeSubmit = async () => {
    if (!judgeActiveGroup || judgeIsSubmitting || !adminJudgeId) return;

    setJudgeIsSubmitting(true);
    try {
      const response = await fetch('/api/scores/submit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          groupId: judgeActiveGroup.id,
          judgeId: adminJudgeId,
          scores: judgeDancers.map(d => ({
            dancerId: d.id,
            ...judgeLocalScores[d.id],
          })),
        }),
      });

      if (response.ok) {
        localStorage.removeItem(`scoring_draft_${judgeActiveGroup.id}_${adminJudgeId}`);
        setJudgeIsSubmitted(true);
      } else {
        const err = await response.json();
        alert(err.error || 'Failed to submit scores');
      }
    } catch {
      alert('Connection error. Your scores are saved locally. Try again.');
    } finally {
      setJudgeIsSubmitting(false);
    }
  };

  const handleLogout = () => {
    localStorage.clear();
    router.push('/');
  };

  const tabs: { id: Tab; label: string }[] = [
    { id: 'setup', label: 'Setup' },
    { id: 'monitor', label: 'Monitor' },
    { id: 'results', label: 'Results' },
    ...(adminJudgeId ? [{ id: 'judge' as Tab, label: 'Judge' }] : []),
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <SessionHeader
        sessionName={session?.name || 'Loading...'}
        role="admin"
        onLogout={handleLogout}
      />

      {/* Session Status Bar */}
      {session && (
        <div className="bg-white border-b border-gray-200 px-4 py-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${
              session.status === 'active' ? 'bg-green-100 text-green-700' :
              session.status === 'completed' ? 'bg-gray-100 text-gray-600' :
              session.status === 'paused' ? 'bg-yellow-100 text-yellow-700' :
              'bg-blue-100 text-blue-700'
            }`}>
              {session.status}
            </span>
            {session.is_locked && (
              <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-red-100 text-red-700">
                Locked
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 text-sm text-gray-500">
            <span>{dancers.length} dancers | {judges.length} judges | {groups.filter(g => g.material_id === null && !g.is_archived).length} groups</span>
            {!adminJudgeId && (
              <button
                onClick={handleJoinAsJudge}
                disabled={joiningAsJudge}
                className="px-3 py-1 bg-purple-600 text-white text-xs rounded-md hover:bg-purple-700 disabled:bg-gray-300"
              >
                {joiningAsJudge ? 'Joining...' : 'Join as Judge'}
              </button>
            )}
            <button
              onClick={() => { navigator.clipboard.writeText(session?.session_code || sessionId); }}
              title={session?.session_code || sessionId}
              className="px-2 py-0.5 bg-gray-100 hover:bg-gray-200 rounded text-xs font-mono text-gray-500 transition-colors"
            >
              {session?.session_code || sessionId.slice(0, 8) + '...'}
            </button>
            <button
              onClick={() => router.push('/admin/new')}
              className="px-2 py-0.5 bg-gray-100 hover:bg-gray-200 rounded text-xs text-gray-500 transition-colors"
            >
              + New Session
            </button>
          </div>
        </div>
      )}

      {/* Tab Navigation */}
      <div className="bg-white border-b border-gray-200 px-4">
        <div className="flex gap-4">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      <main className="p-4 max-w-6xl mx-auto">
        {/* ===== SETUP TAB ===== */}
        {activeTab === 'setup' && (
          <div className="space-y-6">
            {/* Session Controls */}
            {session?.status === 'setup' && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-center justify-between">
                <div>
                  <div className="font-medium text-blue-900">Session in setup mode</div>
                  <div className="text-sm text-blue-700">Add dancers, judges, and groups, then activate the session.</div>
                </div>
                <button
                  onClick={handleActivateSession}
                  disabled={dancers.length === 0 || judges.length === 0}
                  className="px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
                >
                  Activate Session
                </button>
              </div>
            )}

            {/* Dancer Import */}
            <DancerImport
              sessionId={sessionId}
              token={token}
              onImportComplete={loadDancers}
            />

            {/* Manual Dancer Add */}
            <ManualDancerAdd
              sessionId={sessionId}
              token={token}
              onDancerAdded={loadDancers}
            />

            {/* Existing Dancers */}
            {dancers.length > 0 && (
              <div className="bg-white rounded-lg border border-gray-200 p-4">
                <h3 className="font-semibold text-gray-900 mb-2">Dancers ({dancers.length})</h3>
                <div className="max-h-48 overflow-y-auto">
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                    {dancers.map(d => (
                      <div key={d.id} className="text-sm bg-gray-50 rounded px-2 py-1 flex items-center justify-between group">
                        <span>
                          <span className="font-mono font-semibold">#{d.dancer_number}</span>{' '}
                          <span className="text-gray-600">{d.name}</span>
                          {d.grade != null && (
                            <span className="ml-1 px-1.5 py-0.5 bg-gray-200 text-gray-600 text-xs rounded">
                              Gr {d.grade}
                            </span>
                          )}
                        </span>
                        <button
                          onClick={() => handleDeleteDancer(d.id, d.dancer_number)}
                          className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity ml-1"
                          title="Delete dancer"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Materials */}
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <h3 className="font-semibold text-gray-900 mb-3">Materials</h3>
              <div className="flex gap-2 mb-3 flex-wrap">
                {materials.map(m => (
                  <span key={m.id} className={`px-3 py-1 ${getMaterialColor(m.id, materials).bg} ${getMaterialColor(m.id, materials).text} rounded-full text-sm`}>
                    {m.name}
                  </span>
                ))}
                {materials.length === 0 && (
                  <span className="text-sm text-gray-400">No materials yet. Add materials here, then assign them when pushing groups.</span>
                )}
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newMaterialName}
                  onChange={e => setNewMaterialName(e.target.value)}
                  placeholder="Material name"
                  className="flex-1 px-3 py-1.5 border border-gray-300 rounded-md text-sm"
                  onKeyDown={e => e.key === 'Enter' && handleAddMaterial()}
                />
                <button
                  onClick={handleAddMaterial}
                  disabled={addingMaterial || !newMaterialName.trim()}
                  className="px-4 py-1.5 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 disabled:bg-gray-300"
                >
                  Add
                </button>
              </div>
            </div>

            {/* Judges */}
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <h3 className="font-semibold text-gray-900 mb-3">Judges</h3>
              {judges.length > 0 && (
                <div className="space-y-2 mb-3">
                  {judges.map(j => (
                    <div key={j.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
                      <div>
                        <span className="font-medium text-gray-900">{j.name}</span>
                        {j.is_admin_judge && (
                          <span className="ml-2 px-1.5 py-0.5 bg-purple-100 text-purple-700 text-xs rounded">Admin</span>
                        )}
                        <span className="ml-3 font-mono text-sm text-gray-500">PIN: {j.judge_pin}</span>
                      </div>
                      <button
                        onClick={() => handleRemoveJudge(j.id)}
                        className="text-red-500 hover:text-red-700 text-sm"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newJudgeName}
                  onChange={e => setNewJudgeName(e.target.value)}
                  placeholder="Judge name"
                  className="flex-1 px-3 py-1.5 border border-gray-300 rounded-md text-sm"
                  onKeyDown={e => e.key === 'Enter' && handleAddJudge()}
                />
                <button
                  onClick={handleAddJudge}
                  disabled={addingJudge || !newJudgeName.trim()}
                  className="px-4 py-1.5 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 disabled:bg-gray-300"
                >
                  Add Judge
                </button>
              </div>
            </div>

            {/* Group Builder */}
            <GroupBuilder
              dancers={dancers}
              sessionId={sessionId}
              token={token}
              onGroupCreated={loadGroups}
              existingGroupCount={groups.filter(g => g.material_id === null && !g.is_archived).length}
            />

            {/* Existing Groups (templates only, not archived) */}
            {groups.filter(g => g.material_id === null && !g.is_archived).length > 0 && (
              <div className="bg-white rounded-lg border border-gray-200 p-4">
                <h3 className="font-semibold text-gray-900 mb-2">Groups ({groups.filter(g => g.material_id === null && !g.is_archived).length})</h3>
                <div className="space-y-2">
                  {groups.filter(g => g.material_id === null && !g.is_archived).map(g => (
                    <div key={g.id} className="text-sm bg-gray-50 rounded px-3 py-2 flex items-center justify-between group">
                      <div className="min-w-0">
                        <span>Group {g.group_number} — {g.dancer_ids.length} dancers</span>
                        {g.dancer_ids.length > 0 && (
                          <div className="text-xs text-gray-400 mt-0.5 truncate">
                            {g.dancer_ids
                              .map(id => dancerMap[id] ? `#${dancerMap[id].dancer_number} ${dancerMap[id].name}` : null)
                              .filter(Boolean)
                              .join(', ')}
                          </div>
                        )}
                      </div>
                      <button
                        onClick={async () => {
                          if (!confirm('Archive this group? It will be hidden but scores are preserved.')) return;
                          try {
                            const res = await fetch(`/api/groups?groupId=${g.id}`, {
                              method: 'DELETE',
                              headers: { 'Authorization': `Bearer ${token}` },
                            });
                            if (res.ok) loadGroups();
                            else alert('Failed to archive group');
                          } catch { alert('Failed to archive group'); }
                        }}
                        className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity ml-2"
                        title="Archive group"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ===== MONITOR TAB ===== */}
        {activeTab === 'monitor' && (
          <div className="space-y-4">
            <AdHocGroupCreator sessionId={sessionId} token={token} />
            <ProgressMonitor sessionId={sessionId} token={token} />
          </div>
        )}

        {/* ===== RESULTS TAB ===== */}
        {activeTab === 'results' && (
          <ResultsTable
            sessionId={sessionId}
            token={token}
            isLocked={session?.is_locked || false}
            onLockSession={handleLockSession}
            onUnlockSession={handleUnlockSession}
          />
        )}

        {/* ===== JUDGE TAB ===== */}
        {activeTab === 'judge' && adminJudgeId && (
          <div>
            {/* Sub-tabs */}
            <div className="flex gap-4 mb-4 border-b border-gray-200">
              <button
                onClick={() => setJudgeSubTab('score')}
                className={`py-2 text-sm font-medium border-b-2 transition-colors ${
                  judgeSubTab === 'score'
                    ? 'border-purple-600 text-purple-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                Score
              </button>
              <button
                onClick={() => setJudgeSubTab('my-scores')}
                className={`py-2 text-sm font-medium border-b-2 transition-colors ${
                  judgeSubTab === 'my-scores'
                    ? 'border-purple-600 text-purple-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                My Scores
              </button>
            </div>

            {judgeSubTab === 'score' ? (
              <div className="pb-24">
                {!judgeActiveGroup ? (
                  <div className="text-center py-20">
                    <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                      <svg className="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    <h2 className="text-lg font-medium text-gray-900 mb-2">Waiting for group...</h2>
                    <p className="text-gray-500">Push a group from the Monitor tab to begin scoring.</p>
                  </div>
                ) : judgeIsSubmitted ? (
                  <div className="text-center py-20">
                    <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                      <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <h2 className="text-lg font-medium text-gray-900 mb-2">Scores Submitted!</h2>
                    <p className="text-gray-500 mb-4">
                      Group {judgeActiveGroup.group_number}
                      {judgeActiveGroup.materials?.name ? ` - ${judgeActiveGroup.materials.name}` : ''} scores have been recorded.
                    </p>
                    <p className="text-gray-400 text-sm">Waiting for next group...</p>
                  </div>
                ) : (
                  <>
                    <div className="mb-4 flex items-center justify-between">
                      <h2 className="text-lg font-semibold text-gray-900">
                        Group {judgeActiveGroup.group_number}
                        {judgeActiveGroup.materials?.name ? ` - ${judgeActiveGroup.materials.name}` : ''}
                      </h2>
                      <span className="text-sm text-gray-500">{judgeDancers.length} dancers</span>
                    </div>

                    <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 lg:gap-3 xl:gap-2">
                      {judgeDancers.map((dancer, index) => (
                        <div key={dancer.id} ref={el => { judgeTileRefs.current[index] = el; }}>
                          <DancerTile
                            dancer={dancer}
                            scores={judgeLocalScores[dancer.id] || {}}
                            onScoreChange={(category, value) => handleJudgeScoreChange(dancer.id, category, value)}
                            isLocked={session?.is_locked || false}
                            compact={isWide}
                            isFocused={judgeFocusedTileIndex === index}
                            focusedCategoryIndex={judgeFocusedTileIndex === index ? judgeFocusedCategoryIndex : null}
                            onFocusTile={() => {
                              setJudgeFocusedTileIndex(index);
                              if (judgeFocusedCategoryIndex === null) setJudgeFocusedCategoryIndex(0);
                            }}
                          />
                        </div>
                      ))}
                    </div>

                    <GroupSubmitButton
                      dancers={judgeDancers}
                      localScores={judgeLocalScores}
                      onSubmit={handleJudgeSubmit}
                      isSubmitting={judgeIsSubmitting}
                      isSubmitted={judgeIsSubmitted}
                    />
                  </>
                )}
              </div>
            ) : (
              <MyScoresView
                sessionId={sessionId}
                judgeId={adminJudgeId}
                token={token}
                isLocked={session?.is_locked || false}
              />
            )}
          </div>
        )}
      </main>
    </div>
  );
}
