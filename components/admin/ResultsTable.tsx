'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase/client';
import { calculateDancerResults, calculateAggregatedResults } from '@/lib/scoring/olympic-average';
import type { AggregatedDancerResult, DancerResult } from '@/lib/scoring/olympic-average';
import { SCORE_CATEGORIES, CATEGORY_LABELS } from '@/lib/database.types';
import type { Score, Material, DancerGroup } from '@/lib/database.types';
import { getMaterialColorByName } from '@/lib/material-colors';

interface ResultsTableProps {
  sessionId: string;
  token: string;
  isLocked: boolean;
  onLockSession: () => void;
  onUnlockSession: () => void;
}

type SortField = 'dancer_number' | 'totalScore' | 'olympicAverage' | typeof SCORE_CATEGORIES[number];

export default function ResultsTable({ sessionId, token, isLocked, onLockSession, onUnlockSession }: ResultsTableProps) {
  const [aggregatedResults, setAggregatedResults] = useState<AggregatedDancerResult[]>([]);
  const [singleMaterialResults, setSingleMaterialResults] = useState<DancerResult[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [selectedMaterial, setSelectedMaterial] = useState('');
  const [sortField, setSortField] = useState<SortField>('dancer_number');
  const [sortAsc, setSortAsc] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [expandedDancers, setExpandedDancers] = useState<Set<string>>(new Set());

  const loadResults = useCallback(async () => {
    // Get dancers
    const { data: dancers } = await supabase
      .from('dancers')
      .select('*')
      .eq('session_id', sessionId)
      .order('dancer_number');

    if (!dancers || dancers.length === 0) {
      setAggregatedResults([]);
      setSingleMaterialResults([]);
      return;
    }

    const dancerIds = dancers.map(d => d.id);

    // Get all scores
    const { data: scores } = await supabase
      .from('scores')
      .select('*')
      .in('dancer_id', dancerIds);

    const allScores = (scores || []) as Score[];

    if (selectedMaterial) {
      // Single material mode: derive dancers from groups with this material
      const { data: groups } = await supabase
        .from('dancer_groups')
        .select('id, dancer_ids')
        .eq('session_id', sessionId)
        .eq('material_id', selectedMaterial);

      const materialDancerIds = new Set<string>();
      for (const g of (groups || [])) {
        for (const did of g.dancer_ids) materialDancerIds.add(did);
      }

      const materialGroupIds = new Set((groups || []).map(g => g.id));
      const materialScores = allScores.filter(s => materialGroupIds.has(s.group_id));

      const filteredDancers = dancers.filter(d => materialDancerIds.has(d.id));
      const results = filteredDancers.map(d => {
        const dancerScores = materialScores.filter(s => s.dancer_id === d.id);
        return calculateDancerResults(d.id, d.dancer_number, d.name, dancerScores);
      });

      setSingleMaterialResults(results);
      setAggregatedResults([]);
    } else {
      // Aggregated mode: get groups to build group→material map
      const { data: groups } = await supabase
        .from('dancer_groups')
        .select('*, materials(name)')
        .eq('session_id', sessionId);

      const groupMaterialMap = new Map<string, { materialId: string; materialName: string }>();
      for (const g of (groups || []) as (DancerGroup & { materials?: { name: string } | null })[]) {
        // Only include instance groups (with material_id) in the map
        if (g.material_id) {
          groupMaterialMap.set(g.id, {
            materialId: g.material_id,
            materialName: g.materials?.name || 'Unknown',
          });
        }
      }

      const results = calculateAggregatedResults(dancers, allScores, groupMaterialMap);
      setAggregatedResults(results);
      setSingleMaterialResults([]);
    }
  }, [sessionId, selectedMaterial]);

  useEffect(() => {
    loadResults();
  }, [loadResults]);

  useEffect(() => {
    async function loadMaterials() {
      const { data } = await supabase
        .from('materials')
        .select('*')
        .eq('session_id', sessionId);
      setMaterials((data || []) as Material[]);
    }
    loadMaterials();
  }, [sessionId]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(field === 'dancer_number');
    }
  };

  const toggleExpand = (dancerId: string) => {
    setExpandedDancers(prev => {
      const next = new Set(prev);
      if (next.has(dancerId)) {
        next.delete(dancerId);
      } else {
        next.add(dancerId);
      }
      return next;
    });
  };

  // Sort aggregated results
  const sortedAggregated = [...aggregatedResults].sort((a, b) => {
    let aVal: number, bVal: number;
    if (sortField === 'dancer_number') {
      aVal = a.dancerNumber;
      bVal = b.dancerNumber;
    } else if (sortField === 'totalScore') {
      aVal = a.totalScore ?? -1;
      bVal = b.totalScore ?? -1;
    } else if (sortField === 'olympicAverage') {
      aVal = a.olympicAverage ?? -1;
      bVal = b.olympicAverage ?? -1;
    } else {
      aVal = a.categoryTotals[sortField] ?? -1;
      bVal = b.categoryTotals[sortField] ?? -1;
    }
    return sortAsc ? aVal - bVal : bVal - aVal;
  });

  // Sort single material results
  const sortedSingleMaterial = [...singleMaterialResults].sort((a, b) => {
    let aVal: number, bVal: number;
    if (sortField === 'dancer_number') {
      aVal = a.dancerNumber;
      bVal = b.dancerNumber;
    } else if (sortField === 'totalScore') {
      aVal = a.totalScore ?? -1;
      bVal = b.totalScore ?? -1;
    } else if (sortField === 'olympicAverage') {
      aVal = a.olympicAverage ?? -1;
      bVal = b.olympicAverage ?? -1;
    } else {
      aVal = a.categoryAverages[sortField] ?? -1;
      bVal = b.categoryAverages[sortField] ?? -1;
    }
    return sortAsc ? aVal - bVal : bVal - aVal;
  });

  const handleExport = async () => {
    setExporting(true);
    try {
      const url = `/api/results/${sessionId}/export${selectedMaterial ? `?materialId=${selectedMaterial}` : ''}`;
      const res = await fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` },
      });

      if (!res.ok) throw new Error('Export failed');

      const blob = await res.blob();
      const downloadUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = `audition-results.csv`;
      a.click();
      URL.revokeObjectURL(downloadUrl);
    } catch {
      alert('Export failed');
    } finally {
      setExporting(false);
    }
  };

  const hasResults = selectedMaterial ? singleMaterialResults.length > 0 : aggregatedResults.length > 0;

  const SortHeader = ({ field, label }: { field: SortField; label: string }) => (
    <th
      onClick={() => handleSort(field)}
      className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase cursor-pointer hover:bg-gray-100 select-none"
    >
      {label} {sortField === field ? (sortAsc ? '\u2191' : '\u2193') : ''}
    </th>
  );

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <select
            value={selectedMaterial}
            onChange={e => {
              setSelectedMaterial(e.target.value);
              setExpandedDancers(new Set());
            }}
            className="px-3 py-1.5 border border-gray-300 rounded-md text-sm"
          >
            <option value="">All Materials</option>
            {materials.map(m => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
          <button
            onClick={loadResults}
            className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-md"
          >
            Refresh
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleExport}
            disabled={exporting || !hasResults}
            className="px-4 py-1.5 bg-green-600 text-white text-sm rounded-md hover:bg-green-700 disabled:bg-gray-300"
          >
            {exporting ? 'Exporting...' : 'Export CSV'}
          </button>
          {!isLocked && (
            <button
              onClick={onLockSession}
              className="px-4 py-1.5 bg-red-600 text-white text-sm rounded-md hover:bg-red-700"
            >
              Lock Session
            </button>
          )}
          {isLocked && (
            <button
              onClick={onUnlockSession}
              className="px-4 py-1.5 bg-yellow-600 text-white text-sm rounded-md hover:bg-yellow-700"
            >
              Unlock Session
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      {!hasResults ? (
        <div className="text-center py-8 text-gray-400 text-sm">
          No scores submitted yet.
        </div>
      ) : (
        <div className="overflow-x-auto border rounded-lg">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 w-8"></th>
                <SortHeader field="dancer_number" label="#" />
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Name</th>
                {SCORE_CATEGORIES.map(cat => (
                  <SortHeader key={cat} field={cat} label={CATEGORY_LABELS[cat]} />
                ))}
                <SortHeader field="totalScore" label="Total Score" />
                <SortHeader field="olympicAverage" label="Olympic Avg" />
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Judges</th>
              </tr>
            </thead>
            {selectedMaterial ? (
              <tbody className="divide-y divide-gray-100">
                {sortedSingleMaterial.map(r => (
                  <tr key={r.dancerId} className="hover:bg-gray-50">
                    <td className="px-3 py-2"></td>
                    <td className="px-3 py-2 font-mono">{r.dancerNumber}</td>
                    <td className="px-3 py-2">{r.dancerName}</td>
                    {SCORE_CATEGORIES.map(cat => (
                      <td key={cat} className="px-3 py-2 font-mono">
                        {r.categoryAverages[cat]?.toFixed(2) ?? '-'}
                      </td>
                    ))}
                    <td className="px-3 py-2 font-mono">
                      {r.totalScore?.toFixed(2) ?? '-'}
                    </td>
                    <td className="px-3 py-2 font-mono font-semibold">
                      {r.olympicAverage?.toFixed(2) ?? '-'}
                    </td>
                    <td className="px-3 py-2">
                      <span className={`text-xs ${r.isOlympicAverage ? 'text-green-600' : 'text-yellow-600'}`}>
                        {r.judgeCount} {!r.isOlympicAverage && r.judgeCount > 0 ? '(reg avg)' : ''}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            ) : (
              sortedAggregated.map(r => {
                const isExpanded = expandedDancers.has(r.dancerId);
                const hasMultipleMaterials = r.materialResults.length > 1;
                return (
                  <tbody key={r.dancerId} className="divide-y divide-gray-100">
                    <tr
                      onClick={() => hasMultipleMaterials && toggleExpand(r.dancerId)}
                      className={`hover:bg-gray-50 ${hasMultipleMaterials ? 'cursor-pointer' : ''}`}
                    >
                      <td className="px-3 py-2 text-gray-400 text-xs">
                        {hasMultipleMaterials ? (isExpanded ? '▼' : '▶') : ''}
                      </td>
                      <td className="px-3 py-2 font-mono">{r.dancerNumber}</td>
                      <td className="px-3 py-2">{r.dancerName}</td>
                      {SCORE_CATEGORIES.map(cat => (
                        <td key={cat} className="px-3 py-2 font-mono">
                          {r.categoryTotals[cat]?.toFixed(2) ?? '-'}
                        </td>
                      ))}
                      <td className="px-3 py-2 font-mono">
                        {r.totalScore?.toFixed(2) ?? '-'}
                      </td>
                      <td className="px-3 py-2 font-mono font-semibold">
                        {r.olympicAverage?.toFixed(2) ?? '-'}
                      </td>
                      <td className="px-3 py-2">
                        <span className={`text-xs ${r.isOlympicAverage ? 'text-green-600' : 'text-yellow-600'}`}>
                          {r.judgeCount} {!r.isOlympicAverage && r.judgeCount > 0 ? '(reg avg)' : ''}
                        </span>
                      </td>
                    </tr>
                    {isExpanded && r.materialResults.map(mr => (
                      <tr key={mr.materialId} className="bg-gray-50/50">
                        <td className="px-3 py-1.5"></td>
                        <td className="px-3 py-1.5"></td>
                        <td className="px-3 py-1.5 pl-6">
                          <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${getMaterialColorByName(mr.materialName, materials).bg} ${getMaterialColorByName(mr.materialName, materials).text}`}>
                            {mr.materialName}
                          </span>
                        </td>
                        {SCORE_CATEGORIES.map(cat => (
                          <td key={cat} className="px-3 py-1.5 font-mono text-xs text-gray-600">
                            {mr.result.categoryAverages[cat]?.toFixed(2) ?? '-'}
                          </td>
                        ))}
                        <td className="px-3 py-1.5 font-mono text-xs text-gray-600">
                          {mr.result.totalScore?.toFixed(2) ?? '-'}
                        </td>
                        <td className="px-3 py-1.5 font-mono text-xs text-gray-600 font-semibold">
                          {mr.result.olympicAverage?.toFixed(2) ?? '-'}
                        </td>
                        <td className="px-3 py-1.5">
                          <span className={`text-xs ${mr.result.isOlympicAverage ? 'text-green-600' : 'text-yellow-600'}`}>
                            {mr.result.judgeCount}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                );
              })
            )}
          </table>
        </div>
      )}
    </div>
  );
}
