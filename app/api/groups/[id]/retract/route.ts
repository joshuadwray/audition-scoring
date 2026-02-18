import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { requireAdmin } from '@/lib/auth/session';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    requireAdmin(request);

    const body = await request.json();
    const deleteScores = body.deleteScores === true;

    // Load group
    const { data: group, error: loadError } = await supabaseAdmin
      .from('dancer_groups')
      .select('*')
      .eq('id', id)
      .single();

    if (loadError || !group) {
      return NextResponse.json({ error: 'Group not found' }, { status: 404 });
    }

    // Must be an instance (has material_id)
    if (!group.material_id) {
      return NextResponse.json({ error: 'Cannot retract a template group' }, { status: 400 });
    }

    // Update status to retracted
    const { data: updated, error: updateError } = await supabaseAdmin
      .from('dancer_groups')
      .update({ status: 'retracted' })
      .eq('id', id)
      .select()
      .single();

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    // Optionally delete scores and submissions
    if (deleteScores) {
      await supabaseAdmin
        .from('scores')
        .delete()
        .eq('group_id', id);

      await supabaseAdmin
        .from('score_submissions')
        .delete()
        .eq('group_id', id);
    }

    // Log admin action
    await supabaseAdmin.from('admin_actions').insert({
      session_id: group.session_id,
      action_type: 'retract_group',
      details: {
        group_id: id,
        group_number: group.group_number,
        material_id: group.material_id,
        scores_deleted: deleteScores,
      },
    });

    return NextResponse.json(updated);
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
