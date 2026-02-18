'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase/client';
import DancerPicker from '@/components/shared/DancerPicker';
import type { DancerPickerItem } from '@/components/shared/DancerPicker';
import type { DancerGroup, Material } from '@/lib/database.types';

interface AdHocGroupCreatorProps {
  sessionId: string;
  token: string;
}

export default function AdHocGroupCreator({ sessionId, token }: AdHocGroupCreatorProps) {
  const [expanded, setExpanded] = useState(false);
  const [dancers, setDancers] = useState<DancerPickerItem[]>([]);
  const [groups, setGroups] = useState<DancerGroup[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [selectedDancerIds, setSelectedDancerIds] = useState<string[]>([]);
  const [selectedMaterialId, setSelectedMaterialId] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  const loadData = useCallback(async () => {
    const [dancerRes, groupRes, materialRes] = await Promise.all([
      supabase
        .from('dancers')
        .select('*')
        .eq('session_id', sessionId)
        .order('dancer_number'),
      supabase
        .from('dancer_groups')
        .select('*')
        .eq('session_id', sessionId)
        .order('group_number'),
      supabase
        .from('materials')
        .select('*')
        .eq('session_id', sessionId),
    ]);

    const groupData = (groupRes.data || []) as DancerGroup[];
    setGroups(groupData);
    setMaterials((materialRes.data || []) as Material[]);

    // Build dancer list with group numbers
    const dancerData = (dancerRes.data || []) as Array<{
      id: string;
      dancer_number: number;
      name: string;
      grade: number | null;
    }>;

    // Only count template groups (material_id is null) for group number display
    const templateGroups = groupData.filter(g => g.material_id === null);

    const enriched: DancerPickerItem[] = dancerData.map(d => {
      const groupNumbers = templateGroups
        .filter(g => g.dancer_ids.includes(d.id))
        .map(g => g.group_number);

      return {
        id: d.id,
        dancer_number: d.dancer_number,
        name: d.name,
        grade: d.grade,
        groupNumbers,
      };
    });

    setDancers(enriched);
  }, [sessionId]);

  useEffect(() => {
    if (expanded) {
      loadData();
    }
  }, [expanded, loadData]);

  // Count only templates for next group number
  const templateGroups = groups.filter(g => g.material_id === null);
  const nextGroupNumber = templateGroups.length > 0
    ? Math.max(...templateGroups.map(g => g.group_number)) + 1
    : 1;

  const handleCreate = async () => {
    if (selectedDancerIds.length === 0 || !selectedMaterialId) return;

    setCreating(true);
    setError('');

    try {
      // Step 1: Create template
      const createRes = await fetch('/api/groups', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          sessionId,
          dancerIds: selectedDancerIds,
          groupNumber: nextGroupNumber,
        }),
      });

      if (!createRes.ok) {
        const data = await createRes.json();
        setError(data.error || 'Failed to create group');
        return;
      }

      const template = await createRes.json();

      // Step 2: Push with selected material
      const pushRes = await fetch(`/api/groups/${template.id}/push`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ materialId: selectedMaterialId }),
      });

      if (!pushRes.ok) {
        const data = await pushRes.json();
        setError(`Group created but push failed: ${data.error || 'Unknown error'}`);
        loadData();
        return;
      }

      setSelectedDancerIds([]);
      setSelectedMaterialId('');
      loadData();
    } catch {
      setError('Connection error');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full px-4 py-3 flex items-center justify-between text-left"
      >
        <span className="font-semibold text-gray-900">Quick Create & Push</span>
        <span className="text-gray-400 text-sm">{expanded ? '−' : '+'}</span>
      </button>

      {expanded && (
        <div className="px-4 pb-4 border-t border-gray-100 pt-3 space-y-3">
          {/* Dancer picker */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Select Dancers
            </label>
            <DancerPicker
              dancers={dancers}
              selectedIds={selectedDancerIds}
              onSelectionChange={setSelectedDancerIds}
            />
          </div>

          {/* Material dropdown */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Material
            </label>
            <select
              value={selectedMaterialId}
              onChange={e => setSelectedMaterialId(e.target.value)}
              className="w-full px-3 py-1.5 border border-gray-300 rounded-md text-sm"
            >
              <option value="">Select material...</option>
              {materials.map(m => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </div>

          {error && <div className="text-red-600 text-sm">{error}</div>}

          <button
            onClick={handleCreate}
            disabled={creating || selectedDancerIds.length === 0 || !selectedMaterialId}
            className="w-full px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
          >
            {creating ? 'Creating & Pushing...' : `Create & Push Group ${nextGroupNumber}`}
          </button>
        </div>
      )}
    </div>
  );
}
