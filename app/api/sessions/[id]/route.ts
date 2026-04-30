import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { requireSessionAdmin } from '@/lib/auth/session';

function isUUID(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Resolve UUID or session_code
    const column = isUUID(id) ? 'id' : 'session_code';
    const lookupValue = isUUID(id) ? id : id.toUpperCase();

    const { data, error } = await supabaseAdmin
      .from('sessions')
      .select('id, session_code, name, date, status, is_locked, created_at, updated_at')
      .eq(column, lookupValue)
      .single();

    if (error || !data) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    // Require admin auth scoped to this session
    requireSessionAdmin(request, data.id);

    return NextResponse.json(data);
  } catch (err) {
    const msg = err instanceof Error ? err.message : '';
    if (msg.includes('Forbidden') || msg.includes('Unauthorized')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    requireSessionAdmin(request, id);

    const body = await request.json();

    // Allow-list: only these fields may be updated via this endpoint
    const allowed = ['name', 'date', 'status'] as const;
    const safeUpdates: Record<string, unknown> = {};
    for (const key of allowed) {
      if (body[key] !== undefined) safeUpdates[key] = body[key];
    }

    const { data, error } = await supabaseAdmin
      .from('sessions')
      .update({ ...safeUpdates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('id, session_code, name, date, status, is_locked, created_at, updated_at')
      .single();

    if (error) {
      console.error('sessions.update', error);
      return NextResponse.json({ error: 'Failed to update session' }, { status: 500 });
    }

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

    const { error } = await supabaseAdmin
      .from('sessions')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('sessions.delete', error);
      return NextResponse.json({ error: 'Failed to delete session' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
