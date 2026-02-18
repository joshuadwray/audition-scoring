'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function NewSessionPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [sessionCode, setSessionCode] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [adminPin, setAdminPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [createdSession, setCreatedSession] = useState<{ id: string; session_code: string; admin_pin: string } | null>(null);

  const isValidCode = /^[a-zA-Z0-9-]{3,20}$/.test(sessionCode);

  const handleCreate = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, date, adminPin, sessionCode }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Failed to create session');
        setLoading(false);
        return;
      }

      setCreatedSession(data);
    } catch {
      setError('Connection error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (createdSession) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white rounded-xl shadow-lg p-8 text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Session Created</h1>
          <p className="text-gray-500 mb-6">Save these details securely</p>

          <div className="bg-gray-50 rounded-lg p-4 mb-4 text-left">
            <div className="mb-3">
              <span className="text-xs font-medium text-gray-500 uppercase">Session Code</span>
              <p className="font-mono text-lg font-bold text-gray-900 tracking-wider">{createdSession.session_code}</p>
            </div>
            <div>
              <span className="text-xs font-medium text-gray-500 uppercase">Admin PIN</span>
              <p className="font-mono text-2xl font-bold text-gray-900 tracking-widest">{createdSession.admin_pin}</p>
            </div>
          </div>

          <button
            onClick={() => {
              navigator.clipboard.writeText(createdSession.session_code);
            }}
            className="w-full mb-3 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm font-medium transition-colors"
          >
            Copy Session Code
          </button>
          <button
            onClick={() => router.push('/')}
            className="w-full py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium transition-colors"
          >
            Go to Login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-xl shadow-lg p-8">
        <h1 className="text-2xl font-bold text-center text-gray-900 mb-2">Create New Session</h1>
        <p className="text-center text-gray-500 mb-8">Set up a new audition scoring session</p>

        <form onSubmit={handleCreate}>
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">Session Code</label>
            <input
              type="text"
              value={sessionCode}
              onChange={e => setSessionCode(e.target.value.replace(/[^a-zA-Z0-9-]/g, '').slice(0, 20))}
              placeholder="e.g. SPRING26"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none text-sm font-mono uppercase"
            />
            <p className="mt-1 text-xs text-gray-400">3-20 characters: letters, numbers, hyphens. Judges use this to log in.</p>
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">Session Name</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Spring 2026 Auditions"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none text-sm"
            />
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none text-sm"
            />
          </div>

          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-1">Admin PIN (6 digits)</label>
            <input
              type="text"
              value={adminPin}
              onChange={e => setAdminPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="123456"
              maxLength={6}
              inputMode="numeric"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none text-sm font-mono text-lg tracking-widest"
            />
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !name || !date || adminPin.length !== 6 || !isValidCode}
            className="w-full py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? 'Creating...' : 'Create Session'}
          </button>
        </form>

        <button
          onClick={() => router.push('/')}
          className="w-full mt-3 py-2.5 text-gray-500 hover:text-gray-700 text-sm"
        >
          Back to Login
        </button>
      </div>
    </div>
  );
}
