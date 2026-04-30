import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { requireSessionAdmin } from '@/lib/auth/session';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    requireSessionAdmin(request, id);

    const { data, error } = await supabaseAdmin
      .from('sessions')
      .update({
        is_locked: true,
        status: 'completed',
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select('id, session_code, name, date, status, is_locked, created_at, updated_at')
      .single();

    if (error) {
      console.error('sessions.lock', error);
      return NextResponse.json({ error: 'Failed to lock session' }, { status: 500 });
    }

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
    requireSessionAdmin(request, id);

    const { data, error } = await supabaseAdmin
      .from('sessions')
      .update({
        is_locked: false,
        status: 'active',
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select('id, session_code, name, date, status, is_locked, created_at, updated_at')
      .single();

    if (error) {
      console.error('sessions.unlock', error);
      return NextResponse.json({ error: 'Failed to unlock session' }, { status: 500 });
    }

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
