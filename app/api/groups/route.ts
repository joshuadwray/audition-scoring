import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { requireAdmin } from '@/lib/auth/session';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get('sessionId');
  const materialId = searchParams.get('materialId');
  const status = searchParams.get('status');

  if (!sessionId) {
    return NextResponse.json({ error: 'sessionId required' }, { status: 400 });
  }

  let query = supabaseAdmin
    .from('dancer_groups')
    .select('*, materials(name)')
    .eq('session_id', sessionId)
    .order('group_number');

  if (materialId) query = query.eq('material_id', materialId);
  if (status) query = query.eq('status', status);

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

export async function DELETE(request: Request) {
  try {
    requireAdmin(request);
    const { searchParams } = new URL(request.url);
    const groupId = searchParams.get('groupId');

    if (!groupId) {
      return NextResponse.json({ error: 'groupId required' }, { status: 400 });
    }

    // Get the template to find its session_id and group_number
    const { data: template, error: fetchError } = await supabaseAdmin
      .from('dancer_groups')
      .select('session_id, group_number, material_id')
      .eq('id', groupId)
      .single();

    if (fetchError || !template) {
      return NextResponse.json({ error: 'Group not found' }, { status: 404 });
    }

    if (template.material_id !== null) {
      return NextResponse.json({ error: 'Cannot archive an instance, archive the template instead' }, { status: 400 });
    }

    // Archive the template and all instances with same group_number + session_id
    const { error } = await supabaseAdmin
      .from('dancer_groups')
      .update({ is_archived: true })
      .eq('session_id', template.session_id)
      .eq('group_number', template.group_number);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}

export async function POST(request: Request) {
  try {
    requireAdmin(request);
    const { sessionId, materialId, dancerIds, groupNumber } = await request.json();

    if (!sessionId || !dancerIds || !groupNumber) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from('dancer_groups')
      .insert({
        session_id: sessionId,
        material_id: materialId || null,
        dancer_ids: dancerIds,
        group_number: groupNumber,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
