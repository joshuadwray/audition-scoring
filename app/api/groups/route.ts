import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { requireSessionAdmin } from '@/lib/auth/session';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get('sessionId');
    const materialId = searchParams.get('materialId');
    const status = searchParams.get('status');

    if (!sessionId) {
      return NextResponse.json({ error: 'sessionId required' }, { status: 400 });
    }

    requireSessionAdmin(request, sessionId);

    let query = supabaseAdmin
      .from('dancer_groups')
      .select('*, materials(name)')
      .eq('session_id', sessionId)
      .order('group_number');

    if (materialId) query = query.eq('material_id', materialId);
    if (status) query = query.eq('status', status);

    const { data, error } = await query;

    if (error) {
      console.error('groups.list', error);
      return NextResponse.json({ error: 'Failed to list groups' }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const groupId = searchParams.get('groupId');

    if (!groupId) {
      return NextResponse.json({ error: 'groupId required' }, { status: 400 });
    }

    const { data: template, error: fetchError } = await supabaseAdmin
      .from('dancer_groups')
      .select('session_id, group_number, material_id')
      .eq('id', groupId)
      .single();

    if (fetchError || !template) {
      return NextResponse.json({ error: 'Group not found' }, { status: 404 });
    }

    requireSessionAdmin(request, template.session_id);

    if (template.material_id !== null) {
      return NextResponse.json({ error: 'Cannot archive an instance, archive the template instead' }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from('dancer_groups')
      .update({ is_archived: true })
      .eq('session_id', template.session_id)
      .eq('group_number', template.group_number);

    if (error) {
      console.error('groups.archive', error);
      return NextResponse.json({ error: 'Failed to archive group' }, { status: 500 });
    }

    await supabaseAdmin.from('admin_actions').insert({
      session_id: template.session_id,
      action_type: 'archive_group',
      details: { group_id: groupId, group_number: template.group_number },
    });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}

export async function POST(request: Request) {
  try {
    const { sessionId, materialId, dancerIds, groupNumber } = await request.json();

    if (!sessionId || !dancerIds || !groupNumber) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    requireSessionAdmin(request, sessionId);

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
      console.error('groups.create', error);
      return NextResponse.json({ error: 'Failed to create group' }, { status: 500 });
    }

    return NextResponse.json(data, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
