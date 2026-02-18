'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import PINInput from '@/components/shared/PINInput';

export default function LandingPage() {
  const router = useRouter();
  const [sessionCode, setSessionCode] = useState('');
  const [pin, setPin] = useState('');
  const [role, setRole] = useState<'admin' | 'judge'>('judge');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/auth/validate-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: sessionCode, pin, role }),
      });

      const data = await res.json();

      if (!data.success) {
        setError(data.error || 'Login failed');
        setLoading(false);
        return;
      }

      // The API returns the resolved UUID sessionId for judge logins
      const resolvedSessionId = data.sessionId || sessionCode;

      // Store auth data
      localStorage.setItem('auth_token', data.token);
      localStorage.setItem('session_name', data.sessionName);
      localStorage.setItem('user_role', role);

      if (role === 'judge') {
        localStorage.setItem('judge_name', data.judgeName);
        localStorage.setItem('judge_id', data.judgeId);
        localStorage.setItem('session_id', resolvedSessionId);
        router.push(`/judge/${resolvedSessionId}`);
      } else {
        // For admin, decode the token to get the sessionId (UUID)
        // The token payload has sessionId as UUID
        const tokenParts = data.token.split('.');
        const payload = JSON.parse(atob(tokenParts[1]));
        const adminSessionId = payload.sessionId;
        localStorage.setItem('session_id', adminSessionId);
        router.push(`/admin/${adminSessionId}`);
      }
    } catch {
      setError('Connection error. Please try again.');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-xl shadow-lg p-8">
          <h1 className="text-2xl font-bold text-center text-gray-900 mb-2">
            Dance Audition Scoring
          </h1>
          <p className="text-center text-gray-500 mb-8">Enter your session details to begin</p>

          {/* Role Toggle */}
          <div className="flex bg-gray-100 rounded-lg p-1 mb-6">
            <button
              onClick={() => { setRole('judge'); setPin(''); }}
              className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
                role === 'judge'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Judge
            </button>
            <button
              onClick={() => { setRole('admin'); setPin(''); }}
              className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
                role === 'admin'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Admin
            </button>
          </div>

          <form onSubmit={handleLogin}>
            {/* Session Code */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">Session Code</label>
              <input
                type="text"
                value={sessionCode}
                onChange={e => setSessionCode(e.target.value)}
                placeholder="e.g. SPRING26"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition-colors text-sm"
              />
            </div>

            {/* PIN Input */}
            <div className="mb-6">
              <PINInput
                length={role === 'admin' ? 6 : 4}
                value={pin}
                onChange={setPin}
                label={`${role === 'admin' ? 'Admin' : 'Judge'} PIN`}
              />
            </div>

            {/* Error */}
            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                {error}
              </div>
            )}

            {/* Login Button */}
            <button
              type="submit"
              disabled={loading || !sessionCode || pin.length < (role === 'admin' ? 6 : 4)}
              className="w-full py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? 'Logging in...' : 'Enter Session'}
            </button>
          </form>

        </div>
      </div>
    </div>
  );
}
