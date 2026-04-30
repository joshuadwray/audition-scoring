import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { createToken } from '@/lib/auth/session';

function isUUID(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

export async function POST(request: Request) {
  try {
    const { sessionId, pin, role } = await request.json();

    if (!sessionId || !pin || !role) {
      return NextResponse.json({ success: false, error: 'Missing required fields' }, { status: 400 });
    }

    // Resolve session: try UUID first, then session_code
    const column = isUUID(sessionId) ? 'id' : 'session_code';
    const lookupValue = isUUID(sessionId) ? sessionId : sessionId.toUpperCase();

    const { data: session, error: sessionError } = await supabaseAdmin
      .from('sessions')
      .select('id, name')
      .eq(column, lookupValue)
      .single();

    if (sessionError || !session) {
      return NextResponse.json({ success: false, error: 'Session not found' }, { status: 404 });
    }

    const resolvedSessionId = session.id;
    const sessionName = session.name;

    if (role === 'admin') {
      const { data: secret } = await supabaseAdmin
        .from('session_secrets')
        .select('admin_pin_hash')
        .eq('session_id', resolvedSessionId)
        .single();

      if (!secret || !await bcrypt.compare(pin, secret.admin_pin_hash)) {
        return NextResponse.json({ success: false, error: 'Invalid PIN' }, { status: 401 });
      }

      // Check for existing admin-judge record
      const { data: adminJudge } = await supabaseAdmin
        .from('judges')
        .select('id, name')
        .eq('session_id', resolvedSessionId)
        .eq('is_admin_judge', true)
        .eq('is_active', true)
        .single();

      const token = createToken({
        sessionId: resolvedSessionId,
        role: 'admin',
        ...(adminJudge ? { judgeId: adminJudge.id, judgeName: adminJudge.name } : {}),
      });

      return NextResponse.json({ success: true, token, sessionName });
    }

    if (role === 'judge') {
      // Find judge in session by matching PIN hash
      const { data: judges } = await supabaseAdmin
        .from('judges')
        .select('id, name, session_id, judge_secrets(judge_pin_hash)')
        .eq('session_id', resolvedSessionId)
        .eq('is_active', true);

      if (!judges || judges.length === 0) {
        return NextResponse.json({ success: false, error: 'Invalid PIN' }, { status: 401 });
      }

      let matchedJudge: { id: string; name: string; session_id: string } | null = null;
      for (const judge of judges) {
        const secret = (judge.judge_secrets as unknown as { judge_pin_hash: string } | null);
        if (secret && await bcrypt.compare(pin, secret.judge_pin_hash)) {
          matchedJudge = judge;
          break;
        }
      }

      if (!matchedJudge) {
        return NextResponse.json({ success: false, error: 'Invalid PIN' }, { status: 401 });
      }

      const token = createToken({
        sessionId: matchedJudge.session_id,
        role: 'judge',
        judgeId: matchedJudge.id,
        judgeName: matchedJudge.name,
      });

      return NextResponse.json({
        success: true,
        token,
        sessionId: resolvedSessionId,
        sessionName,
        judgeName: matchedJudge.name,
        judgeId: matchedJudge.id,
      });
    }

    return NextResponse.json({ success: false, error: 'Invalid role' }, { status: 400 });
  } catch {
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
