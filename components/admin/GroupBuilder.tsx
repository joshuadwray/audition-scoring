'use client';

import { useState } from 'react';
import type { Dancer } from '@/lib/database.types';

interface GroupBuilderProps {
  dancers: Dancer[];
  sessionId: string;
  token: string;
  onGroupCreated: () => void;
  existingGroupCount: number;
}

export default function GroupBuilder({
  dancers,
  sessionId,
  token,
  onGroupCreated,
  existingGroupCount,
}: GroupBuilderProps) {
  const [selectedDancers, setSelectedDancers] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  const toggleDancer = (id: string) => {
    setSelectedDancers(prev =>
      prev.includes(id) ? prev.filter(d => d !== id) : [...prev, id]
    );
  };

  const handleCreate = async () => {
    if (selectedDancers.length === 0) return;

    setCreating(true);
    setError('');

    try {
      const res = await fetch('/api/groups', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          sessionId,
          dancerIds: selectedDancers,
          groupNumber: existingGroupCount + 1,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Failed to create group');
        return;
      }

      setSelectedDancers([]);
      onGroupCreated();
    } catch {
      setError('Connection error');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <h3 className="font-semibold text-gray-900 mb-3">Create Group</h3>

      <div className="mb-3">
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Select Dancers ({selectedDancers.length} selected)
        </label>
        <div className="border rounded-md max-h-48 overflow-y-auto">
          {dancers.map(d => (
            <label
              key={d.id}
              className="flex items-center px-3 py-2 hover:bg-gray-50 cursor-pointer border-b border-gray-50 last:border-0"
            >
              <input
                type="checkbox"
                checked={selectedDancers.includes(d.id)}
                onChange={() => toggleDancer(d.id)}
                className="mr-3 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="font-mono text-sm mr-2">#{d.dancer_number}</span>
              <span className="text-sm text-gray-700">{d.name}</span>
              {d.grade != null && (
                <span className="ml-2 px-1.5 py-0.5 bg-gray-200 text-gray-500 text-xs rounded">
                  Gr {d.grade}
                </span>
              )}
            </label>
          ))}
          {dancers.length === 0 && (
            <div className="px-3 py-4 text-sm text-gray-400 text-center">
              No dancers imported yet
            </div>
          )}
        </div>
      </div>

      {error && <div className="text-red-600 text-sm mb-3">{error}</div>}

      <button
        onClick={handleCreate}
        disabled={creating || selectedDancers.length === 0}
        className="w-full px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
      >
        {creating ? 'Creating...' : `Create Group ${existingGroupCount + 1}`}
      </button>
    </div>
  );
}
