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

    const { data, error } = await supabaseAdmin
      .from('sessions')
      .update({
        is_locked: true,
        status: 'completed',
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Log admin action
    await supabaseAdmin.from('admin_actions').insert({
      session_id: id,
      action_type: 'lock_session',
      details: { locked_at: new Date().toISOString() },
    });

    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    requireAdmin(request);

    const { data, error } = await supabaseAdmin
      .from('sessions')
      .update({
        is_locked: false,
        status: 'active',
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Log admin action
    await supabaseAdmin.from('admin_actions').insert({
      session_id: id,
      action_type: 'unlock_session',
      details: { unlocked_at: new Date().toISOString() },
    });

    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
