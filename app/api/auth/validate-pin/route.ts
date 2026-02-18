import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { createToken } from '@/lib/auth/session';

// Check if the input looks like a UUID
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
    let resolvedSessionId: string;
    let sessionName: string;

    if (isUUID(sessionId)) {
      const { data: session, error } = await supabaseAdmin
        .from('sessions')
        .select('id, name, admin_pin')
        .eq('id', sessionId)
        .single();

      if (error || !session) {
        return NextResponse.json({ success: false, error: 'Session not found' }, { status: 404 });
      }

      resolvedSessionId = session.id;
      sessionName = session.name;

      if (role === 'admin') {
        if (session.admin_pin !== pin) {
          return NextResponse.json({ success: false, error: 'Invalid PIN' }, { status: 401 });
        }

        // Check for admin-judge record
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
    } else {
      // Look up by session_code
      const { data: session, error } = await supabaseAdmin
        .from('sessions')
        .select('id, name, admin_pin')
        .eq('session_code', sessionId.toUpperCase())
        .single();

      if (error || !session) {
        return NextResponse.json({ success: false, error: 'Session not found' }, { status: 404 });
      }

      resolvedSessionId = session.id;
      sessionName = session.name;

      if (role === 'admin') {
        if (session.admin_pin !== pin) {
          return NextResponse.json({ success: false, error: 'Invalid PIN' }, { status: 401 });
        }

        // Check for admin-judge record
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
    }

    if (role === 'judge') {
      const { data: judge, error } = await supabaseAdmin
        .from('judges')
        .select('id, name, judge_pin, session_id, sessions(name)')
        .eq('session_id', resolvedSessionId)
        .eq('judge_pin', pin)
        .eq('is_active', true)
        .single();

      if (error || !judge) {
        return NextResponse.json({ success: false, error: 'Invalid PIN' }, { status: 401 });
      }

      const sessionData = judge.sessions as unknown as { name: string };
      const token = createToken({
        sessionId: judge.session_id,
        role: 'judge',
        judgeId: judge.id,
        judgeName: judge.name,
      });

      return NextResponse.json({
        success: true,
        token,
        sessionId: resolvedSessionId,
        sessionName: sessionData?.name,
        judgeName: judge.name,
        judgeId: judge.id,
      });
    }

    return NextResponse.json({ success: false, error: 'Invalid role' }, { status: 400 });
  } catch {
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
