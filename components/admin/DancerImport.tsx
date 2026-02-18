'use client';

import { useState, useRef } from 'react';

interface DancerImportProps {
  sessionId: string;
  token: string;
  onImportComplete: () => void;
}

interface ParsedDancer {
  dancer_number: number;
  name: string;
  grade: number | null;
}

export default function DancerImport({ sessionId, token, onImportComplete }: DancerImportProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<ParsedDancer[]>([]);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState('');

  const parseCSV = (text: string): ParsedDancer[] => {
    const lines = text.trim().split('\n');
    if (lines.length === 0) return [];

    const dancers: ParsedDancer[] = [];
    // Auto-detect header row: if first column of first line is not a number, skip it
    const firstCols = lines[0].split(',').map(c => c.trim());
    const startIndex = isNaN(parseInt(firstCols[0], 10)) ? 1 : 0;

    for (let i = startIndex; i < lines.length; i++) {
      const cols = lines[i].split(',').map(c => c.trim().replace(/^"|"$/g, ''));
      if (cols.length < 2) continue;

      const dancerNumber = parseInt(cols[0], 10);
      const name = cols[1];
      const grade = cols[2] ? parseInt(cols[2], 10) : null;

      if (isNaN(dancerNumber) || !name) continue;
      dancers.push({ dancer_number: dancerNumber, name, grade: (grade !== null && !isNaN(grade)) ? grade : null });
    }

    return dancers;
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');

    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const parsed = parseCSV(text);
      if (parsed.length === 0) {
        setError('No valid dancers found in CSV. Expected format: Dancer #, Name, Grade (optional)');
        return;
      }
      setPreview(parsed);
    };
    reader.readAsText(file);
  };

  const handleImport = async () => {
    setImporting(true);
    setError('');

    try {
      const res = await fetch('/api/dancers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ sessionId, dancers: preview }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Import failed');
        return;
      }

      setPreview([]);
      if (fileRef.current) fileRef.current.value = '';
      onImportComplete();
    } catch {
      setError('Connection error');
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <h3 className="font-semibold text-gray-900 mb-3">Import Dancers (CSV)</h3>
      <p className="text-xs text-gray-500 mb-3">
        Format: Dancer #, Name, Grade (optional). Example: 12, Jane Doe, 10
      </p>

      <input
        ref={fileRef}
        type="file"
        accept=".csv"
        onChange={handleFileSelect}
        className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 mb-3"
      />

      {error && (
        <div className="text-red-600 text-sm mb-3">{error}</div>
      )}

      {preview.length > 0 && (
        <>
          <div className="border rounded-md overflow-hidden mb-3">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">#</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Name</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Grade</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {preview.slice(0, 10).map((d, i) => (
                  <tr key={i}>
                    <td className="px-3 py-2 font-mono">{d.dancer_number}</td>
                    <td className="px-3 py-2">{d.name}</td>
                    <td className="px-3 py-2 text-gray-500">{d.grade ?? '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {preview.length > 10 && (
              <div className="px-3 py-2 text-xs text-gray-400 bg-gray-50">
                ...and {preview.length - 10} more
              </div>
            )}
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleImport}
              disabled={importing}
              className="px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 disabled:bg-gray-300"
            >
              {importing ? 'Importing...' : `Import ${preview.length} Dancers`}
            </button>
            <button
              onClick={() => { setPreview([]); if (fileRef.current) fileRef.current.value = ''; }}
              className="px-4 py-2 text-gray-600 text-sm rounded-md hover:bg-gray-100"
            >
              Cancel
            </button>
          </div>
        </>
      )}
    </div>
  );
}
