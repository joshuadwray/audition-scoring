'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import SessionHeader from '@/components/shared/SessionHeader';
import MyScoresView from '@/components/judge/MyScoresView';
import { supabase } from '@/lib/supabase/client';

export default function MyScoresPage() {
  const params = useParams();
  const router = useRouter();
  const sessionId = params.sessionId as string;

  const [sessionName, setSessionName] = useState('');
  const [judgeName, setJudgeName] = useState('');
  const [judgeId, setJudgeId] = useState('');
  const [token, setToken] = useState('');
  const [isLocked, setIsLocked] = useState(false);

  useEffect(() => {
    const authToken = localStorage.getItem('auth_token');
    const sName = localStorage.getItem('session_name');
    const jName = localStorage.getItem('judge_name');
    const jId = localStorage.getItem('judge_id');
    const role = localStorage.getItem('user_role');

    // Accept judge role, or admin role with admin_judge_id
    if (!authToken) {
      router.push('/');
      return;
    }

    if (role === 'judge') {
      setJudgeId(jId || '');
      setJudgeName(jName || '');
    } else if (role === 'admin') {
      const adminJudgeId = localStorage.getItem(`admin_judge_id_${sessionId}`);
      if (!adminJudgeId) {
        router.push('/');
        return;
      }
      setJudgeId(adminJudgeId);
      setJudgeName('Admin');
    } else {
      router.push('/');
      return;
    }

    setToken(authToken);
    setSessionName(sName || '');
  }, [router]);

  // Check lock status
  useEffect(() => {
    async function checkLock() {
      const { data } = await supabase
        .from('sessions')
        .select('is_locked')
        .eq('id', sessionId)
        .single();
      if (data) setIsLocked(data.is_locked);
    }
    checkLock();
  }, [sessionId]);

  const handleLogout = () => {
    localStorage.clear();
    router.push('/');
  };

  const role = typeof window !== 'undefined' ? localStorage.getItem('user_role') : 'judge';

  return (
    <div className="min-h-screen bg-gray-50">
      <SessionHeader
        sessionName={sessionName}
        role={role === 'admin' ? 'admin' : 'judge'}
        judgeName={role === 'admin' ? undefined : judgeName}
        onLogout={handleLogout}
      />

      {/* Navigation */}
      <div className="bg-white border-b border-gray-200 px-4 py-2 flex gap-4">
        <button
          onClick={() => router.push(`/judge/${sessionId}`)}
          className="text-sm text-gray-500 hover:text-gray-700 pb-2"
        >
          Score
        </button>
        <span className="text-sm font-medium text-blue-600 border-b-2 border-blue-600 pb-2">
          My Scores
        </span>
      </div>

      <main className="p-4">
        {judgeId && token && (
          <MyScoresView
            sessionId={sessionId}
            judgeId={judgeId}
            token={token}
            isLocked={isLocked}
          />
        )}
      </main>
    </div>
  );
}
