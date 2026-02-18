'use client';

import { useState, useMemo } from 'react';

export interface DancerPickerItem {
  id: string;
  dancer_number: number;
  name: string;
  grade: number | null;
  groupNumbers: number[];
}

interface DancerPickerProps {
  dancers: DancerPickerItem[];
  selectedIds: string[];
  onSelectionChange: (ids: string[]) => void;
}

export default function DancerPicker({
  dancers,
  selectedIds,
  onSelectionChange,
}: DancerPickerProps) {
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    if (!search) return dancers;

    const q = search.toLowerCase();
    return dancers.filter(
      d => d.name.toLowerCase().includes(q) || String(d.dancer_number).includes(q)
    );
  }, [dancers, search]);

  const toggle = (id: string) => {
    onSelectionChange(
      selectedIds.includes(id)
        ? selectedIds.filter(x => x !== id)
        : [...selectedIds, id]
    );
  };

  return (
    <div>
      {/* Search */}
      <input
        type="text"
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="Search by name or number..."
        className="w-full px-3 py-1.5 border border-gray-300 rounded-md text-sm mb-2"
      />

      {/* Scrollable checkbox list */}
      <div className="border rounded-md max-h-56 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="px-3 py-4 text-sm text-gray-400 text-center">
            No dancers match
          </div>
        ) : (
          filtered.map(d => (
            <label
              key={d.id}
              className="flex items-center px-3 py-2 hover:bg-gray-50 cursor-pointer border-b border-gray-50 last:border-0"
            >
              <input
                type="checkbox"
                checked={selectedIds.includes(d.id)}
                onChange={() => toggle(d.id)}
                className="mr-3 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="font-mono text-sm mr-2">#{d.dancer_number}</span>
              <span className="text-sm text-gray-700 flex-1">{d.name}</span>
              {d.grade != null && (
                <span className="text-xs text-gray-400 mr-2">
                  Gr {d.grade}
                </span>
              )}
              {d.groupNumbers.length > 0 && (
                <span className="text-xs text-blue-400">
                  Grp {d.groupNumbers.join(', ')}
                </span>
              )}
            </label>
          ))
        )}
      </div>

      {selectedIds.length > 0 && (
        <div className="mt-1 text-xs text-gray-500">
          {selectedIds.length} selected
        </div>
      )}
    </div>
  );
}
