import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { requireJudge } from '@/lib/auth/session';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const payload = requireJudge(request);
    const { id } = await params;

    // Judges can only change their own PIN
    if (payload.judgeId !== id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const { newPin } = await request.json();

    if (!newPin || !/^\d{4}$/.test(newPin)) {
      return NextResponse.json({ error: 'PIN must be exactly 4 digits' }, { status: 400 });
    }

    // Get judge's session
    const { data: judge } = await supabaseAdmin
      .from('judges')
      .select('session_id')
      .eq('id', id)
      .single();

    if (!judge) {
      return NextResponse.json({ error: 'Judge not found' }, { status: 404 });
    }

    // Check PIN uniqueness within the session
    const { data: conflict } = await supabaseAdmin
      .from('judges')
      .select('id')
      .eq('session_id', judge.session_id)
      .eq('judge_pin', newPin)
      .neq('id', id)
      .single();

    if (conflict) {
      return NextResponse.json({ error: 'That PIN is already in use. Choose a different one.' }, { status: 409 });
    }

    const { error } = await supabaseAdmin
      .from('judges')
      .update({ judge_pin: newPin })
      .eq('id', id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
