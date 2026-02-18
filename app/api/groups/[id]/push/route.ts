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

    // Read materialId from request body
    let materialId: string | undefined;
    try {
      const body = await request.json();
      materialId = body.materialId;
    } catch {
      // No body or invalid JSON
    }

    if (!materialId) {
      return NextResponse.json({ error: 'materialId is required' }, { status: 400 });
    }

    // Load source group (template)
    const { data: sourceGroup, error: loadError } = await supabaseAdmin
      .from('dancer_groups')
      .select('*')
      .eq('id', id)
      .single();

    if (loadError || !sourceGroup) {
      return NextResponse.json({ error: 'Group not found' }, { status: 404 });
    }

    // Create a new instance row cloned from the template
    const { data: instance, error: insertError } = await supabaseAdmin
      .from('dancer_groups')
      .insert({
        session_id: sourceGroup.session_id,
        group_number: sourceGroup.group_number,
        dancer_ids: sourceGroup.dancer_ids,
        material_id: materialId,
        status: 'active',
        pushed_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    // Log admin action
    await supabaseAdmin.from('admin_actions').insert({
      session_id: sourceGroup.session_id,
      action_type: 'push_group',
      details: {
        template_id: id,
        instance_id: instance.id,
        group_number: sourceGroup.group_number,
        material_id: materialId,
      },
    });

    return NextResponse.json(instance);
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
