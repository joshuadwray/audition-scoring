import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
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

    // Get judge's session for uniqueness check
    const { data: judge } = await supabaseAdmin
      .from('judges')
      .select('session_id')
      .eq('id', id)
      .single();

    if (!judge) {
      return NextResponse.json({ error: 'Judge not found' }, { status: 404 });
    }

    // Check PIN uniqueness by comparing against all other judges' hashes in this session
    const { data: otherJudges } = await supabaseAdmin
      .from('judges')
      .select('id, judge_secrets(judge_pin_hash)')
      .eq('session_id', judge.session_id)
      .eq('is_active', true)
      .neq('id', id);

    for (const j of (otherJudges || [])) {
      const secret = (j.judge_secrets as unknown as { judge_pin_hash: string } | null);
      if (secret && await bcrypt.compare(newPin, secret.judge_pin_hash)) {
        return NextResponse.json({ error: 'That PIN is already in use. Choose a different one.' }, { status: 409 });
      }
    }

    const pinHash = await bcrypt.hash(newPin, 12);
    const { error } = await supabaseAdmin
      .from('judge_secrets')
      .update({ judge_pin_hash: pinHash, updated_at: new Date().toISOString() })
      .eq('judge_id', id);

    if (error) {
      console.error('judge.pin.change', error);
      return NextResponse.json({ error: 'Failed to update PIN' }, { status: 500 });
    }

    await supabaseAdmin.from('admin_actions').insert({
      session_id: judge.session_id,
      action_type: 'judge_pin_change',
      details: { judge_id: id },
    });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
