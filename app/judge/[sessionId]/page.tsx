'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import SessionHeader from '@/components/shared/SessionHeader';
import DancerTile from '@/components/judge/DancerTile';
import GroupSubmitButton from '@/components/judge/GroupSubmitButton';
import { subscribeToGroupChanges, subscribeToSessionChanges } from '@/lib/realtime/judge-subscriptions';
import { supabase } from '@/lib/supabase/client';
import type { ScoreState, Dancer, DancerGroupWithMaterial, ScoreCategory } from '@/lib/database.types';
import { SCORE_CATEGORIES } from '@/lib/database.types';

export default function JudgeScoringPage() {
  const params = useParams();
  const router = useRouter();
  const sessionId = params.sessionId as string;

  const [sessionName, setSessionName] = useState('');
  const [judgeName, setJudgeName] = useState('');
  const [judgeId, setJudgeId] = useState('');
  const [token, setToken] = useState('');
  const [activeGroup, setActiveGroup] = useState<DancerGroupWithMaterial | null>(null);
  const [isWide, setIsWide] = useState(false);
  const [dancers, setDancers] = useState<Dancer[]>([]);
  const [localScores, setLocalScores] = useState<Record<string, ScoreState>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [notification, setNotification] = useState('');

  // Keyboard navigation state
  const [focusedTileIndex, setFocusedTileIndex] = useState<number | null>(null);
  const [focusedCategoryIndex, setFocusedCategoryIndex] = useState<number | null>(null);
  const tileRefs = useRef<(HTMLDivElement | null)[]>([]);

  // Detect wide viewport for compact mode
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    setIsWide(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsWide(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  // Load auth from localStorage
  useEffect(() => {
    const authToken = localStorage.getItem('auth_token');
    const sName = localStorage.getItem('session_name');
    const jName = localStorage.getItem('judge_name');
    const jId = localStorage.getItem('judge_id');
    const role = localStorage.getItem('user_role');

    if (!authToken || role !== 'judge') {
      router.push('/');
      return;
    }

    setToken(authToken);
    setSessionName(sName || '');
    setJudgeName(jName || '');
    setJudgeId(jId || '');
  }, [router]);

  // Load active group
  const loadActiveGroup = useCallback(async () => {
    const { data: groups } = await supabase
      .from('dancer_groups')
      .select('*, materials(name)')
      .eq('session_id', sessionId)
      .eq('status', 'active')
      .order('pushed_at', { ascending: false })
      .limit(1);

    if (groups && groups.length > 0) {
      const group = groups[0] as DancerGroupWithMaterial;
      setActiveGroup(group);

      // Check if already submitted
      if (judgeId) {
        const { data: submission } = await supabase
          .from('score_submissions')
          .select('id')
          .eq('group_id', group.id)
          .eq('judge_id', judgeId)
          .single();

        setIsSubmitted(!!submission);
      }

      // Load dancers
      if (group.dancer_ids.length > 0) {
        const { data: dancerData } = await supabase
          .from('dancers')
          .select('*')
          .in('id', group.dancer_ids)
          .order('dancer_number');

        setDancers((dancerData || []) as Dancer[]);
      }
    }
  }, [sessionId, judgeId]);

  useEffect(() => {
    if (judgeId) {
      loadActiveGroup();
    }
  }, [judgeId, loadActiveGroup]);

  // Load draft from localStorage
  useEffect(() => {
    if (!activeGroup?.id || !judgeId || isSubmitted) return;
    const draftKey = `scoring_draft_${activeGroup.id}_${judgeId}`;
    const draft = localStorage.getItem(draftKey);
    if (draft) {
      try {
        setLocalScores(JSON.parse(draft));
      } catch { setLocalScores({}); }
    } else {
      setLocalScores({});
    }
  }, [activeGroup?.id, judgeId, isSubmitted]);

  // Auto-save draft
  useEffect(() => {
    if (!activeGroup?.id || !judgeId || isSubmitted) return;
    const draftKey = `scoring_draft_${activeGroup.id}_${judgeId}`;
    localStorage.setItem(draftKey, JSON.stringify(localScores));
  }, [localScores, activeGroup?.id, judgeId, isSubmitted]);

  // Keyboard navigation handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Skip when typing in inputs
      const tag = (document.activeElement?.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
      // Skip when no group, submitted, or locked
      if (!activeGroup || isSubmitted || isLocked) return;

      if (e.key === 'Escape') {
        setFocusedTileIndex(null);
        setFocusedCategoryIndex(null);
        return;
      }

      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        setFocusedTileIndex(prev => {
          const max = dancers.length - 1;
          if (prev === null) return 0;
          const next = e.key === 'ArrowLeft' ? prev - 1 : prev + 1;
          const clamped = Math.max(0, Math.min(max, next));
          // Scroll tile into view
          setTimeout(() => tileRefs.current[clamped]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 0);
          return clamped;
        });
        setFocusedCategoryIndex(prev => prev === null ? 0 : prev);
        return;
      }

      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
        if (focusedTileIndex === null) {
          setFocusedTileIndex(0);
          setFocusedCategoryIndex(0);
          return;
        }
        setFocusedCategoryIndex(prev => {
          if (prev === null) return 0;
          const next = e.key === 'ArrowUp' ? prev - 1 : prev + 1;
          return Math.max(0, Math.min(4, next));
        });
        return;
      }

      // Number keys 1-5 for scoring
      const num = parseInt(e.key, 10);
      if (num >= 1 && num <= 5 && focusedTileIndex !== null && focusedCategoryIndex !== null) {
        e.preventDefault();
        const dancer = dancers[focusedTileIndex];
        if (!dancer) return;
        const category = SCORE_CATEGORIES[focusedCategoryIndex] as ScoreCategory;
        const currentValue = localScores[dancer.id]?.[category];

        let shouldAdvance = false;
        if (currentValue === num) {
          // Whole selected → toggle to half (except 5)
          if (num < 5) {
            handleScoreChange(dancer.id, category, num + 0.5);
          }
          // Toggling half-score on same number: stay put
        } else if (currentValue === num + 0.5) {
          // Half selected → toggle back to whole
          handleScoreChange(dancer.id, category, num);
          // Toggling back: stay put
        } else {
          // New base number → advance
          handleScoreChange(dancer.id, category, num);
          shouldAdvance = true;
        }

        if (shouldAdvance) {
          if (focusedCategoryIndex < 4) {
            setFocusedCategoryIndex(focusedCategoryIndex + 1);
          } else if (focusedTileIndex < dancers.length - 1) {
            const nextTile = focusedTileIndex + 1;
            setFocusedTileIndex(nextTile);
            setFocusedCategoryIndex(0);
            setTimeout(() => tileRefs.current[nextTile]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 0);
          }
        }
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeGroup, isSubmitted, isLocked, dancers, focusedTileIndex, focusedCategoryIndex, localScores]);

  // Reset focus when group changes or is submitted
  useEffect(() => {
    setFocusedTileIndex(null);
    setFocusedCategoryIndex(null);
  }, [activeGroup?.id, isSubmitted]);

  // Realtime subscriptions
  useEffect(() => {
    if (!sessionId) return;

    const groupChannel = subscribeToGroupChanges(sessionId, (payload) => {
      const newGroup = payload.new as unknown as DancerGroupWithMaterial;
      if (newGroup.status === 'retracted' && activeGroup?.id === newGroup.id) {
        setActiveGroup(null);
        setLocalScores({});
        setDancers([]);
        setIsSubmitted(false);
        if (activeGroup?.id && judgeId) {
          localStorage.removeItem(`scoring_draft_${activeGroup.id}_${judgeId}`);
        }
        setNotification('This group was retracted by the admin.');
        setTimeout(() => setNotification(''), 8000);
      } else if (newGroup.status === 'active') {
        if (activeGroup && !isSubmitted) {
          setNotification('New group available. Finish current group first.');
          setTimeout(() => setNotification(''), 5000);
        } else {
          setIsSubmitted(false);
          setLocalScores({});
          loadActiveGroup();
        }
      }
    });

    const sessionChannel = subscribeToSessionChanges(sessionId, (payload) => {
      const session = payload.new as { is_locked: boolean };
      if (session.is_locked) {
        setIsLocked(true);
      }
    });

    return () => {
      supabase.removeChannel(groupChannel);
      supabase.removeChannel(sessionChannel);
    };
  }, [sessionId, activeGroup, isSubmitted, loadActiveGroup]);

  const handleScoreChange = (dancerId: string, category: string, value: number) => {
    setLocalScores(prev => ({
      ...prev,
      [dancerId]: {
        ...prev[dancerId],
        [category]: value,
      },
    }));
  };

  const handleSubmit = async () => {
    if (!activeGroup || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const response = await fetch('/api/scores/submit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          groupId: activeGroup.id,
          judgeId,
          scores: dancers.map(d => ({
            dancerId: d.id,
            ...localScores[d.id],
          })),
        }),
      });

      if (response.ok) {
        localStorage.removeItem(`scoring_draft_${activeGroup.id}_${judgeId}`);
        setIsSubmitted(true);
      } else {
        const err = await response.json();
        alert(err.error || 'Failed to submit scores');
      }
    } catch {
      alert('Connection error. Your scores are saved locally. Try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLogout = () => {
    localStorage.clear();
    router.push('/');
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <SessionHeader
        sessionName={sessionName}
        role="judge"
        judgeName={judgeName}
        onLogout={handleLogout}
      />

      {/* Navigation */}
      <div className="bg-white border-b border-gray-200 px-4 py-2 flex gap-4">
        <span className="text-sm font-medium text-blue-600 border-b-2 border-blue-600 pb-2">
          Score
        </span>
        <button
          onClick={() => router.push(`/judge/${sessionId}/my-scores`)}
          className="text-sm text-gray-500 hover:text-gray-700 pb-2"
        >
          My Scores
        </button>
      </div>

      {/* Notification Banner */}
      {notification && (
        <div className="bg-blue-50 border-b border-blue-200 px-4 py-3 text-sm text-blue-700">
          {notification}
        </div>
      )}

      {/* Locked Banner */}
      {isLocked && (
        <div className="bg-yellow-50 border-b border-yellow-200 px-4 py-3 text-sm text-yellow-700">
          Session locked. Contact admin to edit scores.
        </div>
      )}

      {/* Main Content */}
      <main className="p-4 pb-24">
        {!activeGroup ? (
          <div className="text-center py-20">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h2 className="text-lg font-medium text-gray-900 mb-2">Waiting for group...</h2>
            <p className="text-gray-500">The admin will push the next group when ready.</p>
          </div>
        ) : isSubmitted ? (
          <div className="text-center py-20">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-lg font-medium text-gray-900 mb-2">Scores Submitted!</h2>
            <p className="text-gray-500 mb-4">
              Group {activeGroup.group_number}
              {activeGroup.materials?.name ? ` - ${activeGroup.materials.name}` : ''} scores have been recorded.
            </p>
            <p className="text-gray-400 text-sm">Waiting for next group...</p>
            <button
              onClick={() => router.push(`/judge/${sessionId}/my-scores`)}
              className="mt-4 text-blue-600 hover:text-blue-800 text-sm font-medium"
            >
              Review My Scores
            </button>
          </div>
        ) : (
          <>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">
                Group {activeGroup.group_number}
                {activeGroup.materials?.name ? ` - ${activeGroup.materials.name}` : ''}
              </h2>
              <span className="text-sm text-gray-500">{dancers.length} dancers</span>
            </div>

            {/* Responsive Grid: 1-col mobile, 2-col tablet, 3-col desktop */}
            <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 lg:gap-3 xl:gap-2">
              {dancers.map((dancer, index) => (
                <div key={dancer.id} ref={el => { tileRefs.current[index] = el; }}>
                  <DancerTile
                    dancer={dancer}
                    scores={localScores[dancer.id] || {}}
                    onScoreChange={(category, value) => handleScoreChange(dancer.id, category, value)}
                    isLocked={isLocked}
                    compact={isWide}
                    isFocused={focusedTileIndex === index}
                    focusedCategoryIndex={focusedTileIndex === index ? focusedCategoryIndex : null}
                    onFocusTile={() => {
                      setFocusedTileIndex(index);
                      if (focusedCategoryIndex === null) setFocusedCategoryIndex(0);
                    }}
                  />
                </div>
              ))}
            </div>

            <GroupSubmitButton
              dancers={dancers}
              localScores={localScores}
              onSubmit={handleSubmit}
              isSubmitting={isSubmitting}
              isSubmitted={isSubmitted}
            />
          </>
        )}
      </main>
    </div>
  );
}
