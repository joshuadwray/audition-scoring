import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { requireSessionAdmin } from '@/lib/auth/session';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get('sessionId');

    if (!sessionId) {
      return NextResponse.json({ error: 'sessionId required' }, { status: 400 });
    }

    requireSessionAdmin(request, sessionId);

    const { data, error } = await supabaseAdmin
      .from('dancers')
      .select('*')
      .eq('session_id', sessionId)
      .order('dancer_number');

    if (error) {
      console.error('dancers.list', error);
      return NextResponse.json({ error: 'Failed to list dancers' }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    // Create a material
    if (body._createMaterial) {
      const { sessionId, materialName } = body;
      if (!sessionId || !materialName) {
        return NextResponse.json({ error: 'sessionId and materialName required' }, { status: 400 });
      }

      requireSessionAdmin(request, sessionId);

      const { data, error } = await supabaseAdmin
        .from('materials')
        .insert({ session_id: sessionId, name: materialName })
        .select()
        .single();

      if (error) {
        console.error('materials.create', error);
        return NextResponse.json({ error: 'Failed to create material' }, { status: 500 });
      }

      return NextResponse.json(data, { status: 201 });
    }

    // Bulk import
    if (Array.isArray(body.dancers)) {
      const { dancers, sessionId } = body;
      requireSessionAdmin(request, sessionId);

      const insertedDancers = [];
      for (const d of dancers) {
        const { data: dancer, error } = await supabaseAdmin
          .from('dancers')
          .insert({
            session_id: sessionId,
            dancer_number: d.dancer_number,
            name: d.name,
            grade: d.grade || null,
          })
          .select()
          .single();

        if (error) {
          console.error('dancers.bulk.create', error);
          return NextResponse.json({ error: `Failed to import dancer #${d.dancer_number}` }, { status: 500 });
        }

        insertedDancers.push(dancer);
      }

      return NextResponse.json(insertedDancers, { status: 201 });
    }

    // Single dancer
    const { session_id, dancer_number, name, grade } = body;

    if (!session_id || !dancer_number || !name) {
      return NextResponse.json({ error: 'session_id, dancer_number, and name are required' }, { status: 400 });
    }

    requireSessionAdmin(request, session_id);

    const { data, error } = await supabaseAdmin
      .from('dancers')
      .insert({ session_id, dancer_number, name, grade: grade || null })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: `Dancer #${dancer_number} already exists in this session` }, { status: 409 });
      }
      console.error('dancers.create', error);
      return NextResponse.json({ error: 'Failed to create dancer' }, { status: 500 });
    }

    return NextResponse.json(data, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const dancerId = searchParams.get('id');
    const force = searchParams.get('force') === 'true';

    if (!dancerId) {
      return NextResponse.json({ error: 'Dancer id required' }, { status: 400 });
    }

    // Verify dancer belongs to admin's session
    const { data: dancer } = await supabaseAdmin
      .from('dancers')
      .select('session_id')
      .eq('id', dancerId)
      .single();

    if (!dancer) {
      return NextResponse.json({ error: 'Dancer not found' }, { status: 404 });
    }

    requireSessionAdmin(request, dancer.session_id);

    // Check for existing scores
    const { data: scores } = await supabaseAdmin
      .from('scores')
      .select('id')
      .eq('dancer_id', dancerId)
      .limit(1);

    if (scores && scores.length > 0 && !force) {
      return NextResponse.json({
        error: 'This dancer has scores. Use force=true to delete dancer and all their scores.',
        hasScores: true,
      }, { status: 409 });
    }

    if (scores && scores.length > 0) {
      await supabaseAdmin.from('scores').delete().eq('dancer_id', dancerId);
    }

    // Remove dancer from dancer_groups.dancer_ids arrays
    const { data: groups } = await supabaseAdmin
      .from('dancer_groups')
      .select('id, dancer_ids')
      .contains('dancer_ids', [dancerId]);

    if (groups && groups.length > 0) {
      for (const group of groups) {
        const updatedIds = group.dancer_ids.filter((id: string) => id !== dancerId);
        await supabaseAdmin
          .from('dancer_groups')
          .update({ dancer_ids: updatedIds, updated_at: new Date().toISOString() })
          .eq('id', group.id);
      }
    }

    const { error } = await supabaseAdmin.from('dancers').delete().eq('id', dancerId);

    if (error) {
      console.error('dancers.delete', error);
      return NextResponse.json({ error: 'Failed to delete dancer' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
