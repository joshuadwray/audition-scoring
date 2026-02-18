'use client';

import { useState } from 'react';

interface ManualDancerAddProps {
  sessionId: string;
  token: string;
  onDancerAdded: () => void;
}

export default function ManualDancerAdd({
  sessionId,
  token,
  onDancerAdded,
}: ManualDancerAddProps) {
  const [dancerNumber, setDancerNumber] = useState('');
  const [name, setName] = useState('');
  const [grade, setGrade] = useState('');
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');

  const handleAdd = async () => {
    if (!dancerNumber || !name.trim()) return;

    setAdding(true);
    setError('');

    try {
      const res = await fetch('/api/dancers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          session_id: sessionId,
          dancer_number: parseInt(dancerNumber, 10),
          name: name.trim(),
          grade: grade ? parseInt(grade, 10) : null,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Failed to add dancer');
        return;
      }

      setDancerNumber('');
      setName('');
      setGrade('');
      onDancerAdded();
    } catch {
      setError('Connection error');
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <h3 className="font-semibold text-gray-900 mb-3">Add Dancer</h3>

      <div className="flex gap-3 mb-3">
        <div className="w-28">
          <label className="block text-sm font-medium text-gray-700 mb-1">Number</label>
          <input
            type="number"
            value={dancerNumber}
            onChange={e => setDancerNumber(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAdd()}
            placeholder="#"
            min="1"
            className="w-full px-3 py-1.5 border border-gray-300 rounded-md text-sm"
          />
        </div>
        <div className="flex-1">
          <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Dancer name"
            className="w-full px-3 py-1.5 border border-gray-300 rounded-md text-sm"
            onKeyDown={e => e.key === 'Enter' && handleAdd()}
          />
        </div>
        <div className="w-24">
          <label className="block text-sm font-medium text-gray-700 mb-1">Grade</label>
          <input
            type="number"
            value={grade}
            onChange={e => setGrade(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAdd()}
            placeholder="Grade"
            className="w-full px-3 py-1.5 border border-gray-300 rounded-md text-sm"
          />
        </div>
      </div>

      {error && <div className="text-red-600 text-sm mb-3">{error}</div>}

      <button
        onClick={handleAdd}
        disabled={adding || !dancerNumber || !name.trim()}
        className="w-full px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
      >
        {adding ? 'Adding...' : 'Add Dancer'}
      </button>
    </div>
  );
}
