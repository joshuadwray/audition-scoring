import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { requireAdmin } from '@/lib/auth/session';
import { calculateDancerResults, calculateAggregatedResults } from '@/lib/scoring/olympic-average';
import { SCORE_CATEGORIES, CATEGORY_LABELS } from '@/lib/database.types';
import type { Score, DancerGroup } from '@/lib/database.types';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const { sessionId } = await params;
    requireAdmin(request);
    const { searchParams } = new URL(request.url);
    const materialId = searchParams.get('materialId');
    const format = searchParams.get('format') || 'csv';

    // Get dancers
    let dancerQuery = supabaseAdmin
      .from('dancers')
      .select('*')
      .eq('session_id', sessionId)
      .order('dancer_number');

    if (materialId) {
      // Derive dancer set from groups with this material
      const { data: matGroups } = await supabaseAdmin
        .from('dancer_groups')
        .select('dancer_ids')
        .eq('session_id', sessionId)
        .eq('material_id', materialId);

      const materialDancerIds = new Set<string>();
      for (const g of (matGroups || [])) {
        for (const did of g.dancer_ids) materialDancerIds.add(did);
      }

      if (materialDancerIds.size > 0) {
        dancerQuery = dancerQuery.in('id', Array.from(materialDancerIds));
      }
    }

    const { data: dancers, error: dancerError } = await dancerQuery;
    if (dancerError) {
      return NextResponse.json({ error: dancerError.message }, { status: 500 });
    }

    // Get all scores for these dancers
    const dancerIds = (dancers || []).map(d => d.id);
    const { data: scores, error: scoreError } = await supabaseAdmin
      .from('scores')
      .select('*')
      .in('dancer_id', dancerIds);

    if (scoreError) {
      return NextResponse.json({ error: scoreError.message }, { status: 500 });
    }

    const allScores = (scores || []) as Score[];

    if (materialId) {
      // Single material mode: filter scores by groups of that material
      const { data: groups } = await supabaseAdmin
        .from('dancer_groups')
        .select('id')
        .eq('session_id', sessionId)
        .eq('material_id', materialId);

      const materialGroupIds = new Set((groups || []).map(g => g.id));
      const materialScores = allScores.filter(s => materialGroupIds.has(s.group_id));

      const results = (dancers || []).map(dancer => {
        const dancerScores = materialScores.filter(s => s.dancer_id === dancer.id);
        return calculateDancerResults(dancer.id, dancer.dancer_number, dancer.name, dancerScores);
      });

      // Sort by olympic average descending
      results.sort((a, b) => (b.olympicAverage ?? 0) - (a.olympicAverage ?? 0));

      if (format === 'json') {
        return NextResponse.json(results);
      }

      const headers = ['Dancer #', 'Name', ...SCORE_CATEGORIES.map(c => CATEGORY_LABELS[c]), 'Total Score', 'Olympic Average'];
      const rows = results.map(r => [
        r.dancerNumber,
        r.dancerName,
        ...SCORE_CATEGORIES.map(c => r.categoryAverages[c]?.toFixed(2) ?? 'N/A'),
        r.totalScore?.toFixed(2) ?? 'N/A',
        r.olympicAverage?.toFixed(2) ?? 'N/A',
      ]);

      const csv = [
        headers.join(','),
        ...rows.map(row => row.map(cell => {
          const str = String(cell);
          return str.includes(',') ? `"${str}"` : str;
        }).join(','))
      ].join('\n');

      return new Response(csv, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="audition-results-${sessionId}.csv"`,
        },
      });
    }

    // Aggregated mode: build group→material map
    const { data: groups } = await supabaseAdmin
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

    const aggregatedResults = calculateAggregatedResults(dancers || [], allScores, groupMaterialMap);

    // Sort by olympic average descending
    aggregatedResults.sort((a, b) => (b.olympicAverage ?? 0) - (a.olympicAverage ?? 0));

    if (format === 'json') {
      return NextResponse.json(aggregatedResults);
    }

    // Generate CSV with aggregated top-level rows and per-material detail rows
    const headers = ['Dancer #', 'Name', ...SCORE_CATEGORIES.map(c => CATEGORY_LABELS[c]), 'Total Score', 'Olympic Average'];
    const csvRows: string[][] = [];

    for (const r of aggregatedResults) {
      // Top-level aggregated row
      csvRows.push([
        String(r.dancerNumber),
        r.dancerName,
        ...SCORE_CATEGORIES.map(c => r.categoryTotals[c]?.toFixed(2) ?? 'N/A'),
        r.totalScore?.toFixed(2) ?? 'N/A',
        r.olympicAverage?.toFixed(2) ?? 'N/A',
      ]);

      // Per-material detail rows (only if multiple materials)
      if (r.materialResults.length > 1) {
        for (const mr of r.materialResults) {
          csvRows.push([
            '',
            `  ${mr.materialName}`,
            ...SCORE_CATEGORIES.map(c => mr.result.categoryAverages[c]?.toFixed(2) ?? 'N/A'),
            mr.result.totalScore?.toFixed(2) ?? 'N/A',
            mr.result.olympicAverage?.toFixed(2) ?? 'N/A',
          ]);
        }
      }
    }

    const csv = [
      headers.join(','),
      ...csvRows.map(row => row.map(cell => {
        const str = String(cell);
        return str.includes(',') ? `"${str}"` : str;
      }).join(','))
    ].join('\n');

    return new Response(csv, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="audition-results-${sessionId}.csv"`,
      },
    });
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
