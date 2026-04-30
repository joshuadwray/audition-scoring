import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { createToken } from '@/lib/auth/session';

// Rate limit thresholds
const PER_IP_PER_SESSION_FAILURES_1MIN = 5;
const PER_SESSION_FAILURES_1HOUR = 30;

function isUUID(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function getClientIp(request: Request): string {
  // Vercel sets x-forwarded-for; fall back to a fixed string so rate limiting
  // still works in dev (where the header is absent)
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return '127.0.0.1';
}

async function checkRateLimit(sessionCode: string, ip: string): Promise<{ limited: boolean; reason?: string }> {
  const now = new Date();
  const oneMinuteAgo = new Date(now.getTime() - 60_000).toISOString();
  const oneHourAgo = new Date(now.getTime() - 3_600_000).toISOString();

  // Per-IP per-session: max 5 failures in last minute
  const { count: ipCount } = await supabaseAdmin
    .from('login_attempts')
    .select('*', { count: 'exact', head: true })
    .eq('session_code', sessionCode)
    .eq('ip_address', ip)
    .eq('success', false)
    .gte('attempted_at', oneMinuteAgo);

  if ((ipCount ?? 0) >= PER_IP_PER_SESSION_FAILURES_1MIN) {
    return { limited: true, reason: 'Too many failed attempts. Please wait a minute and try again.' };
  }

  // Per-session global: max 30 failures in last hour
  const { count: sessionCount } = await supabaseAdmin
    .from('login_attempts')
    .select('*', { count: 'exact', head: true })
    .eq('session_code', sessionCode)
    .eq('success', false)
    .gte('attempted_at', oneHourAgo);

  if ((sessionCount ?? 0) >= PER_SESSION_FAILURES_1HOUR) {
    return { limited: true, reason: 'Too many failed attempts for this session. Please try again later.' };
  }

  return { limited: false };
}

async function recordAttempt(sessionCode: string, ip: string, success: boolean) {
  await supabaseAdmin
    .from('login_attempts')
    .insert({ session_code: sessionCode, ip_address: ip, success });
}

export async function POST(request: Request) {
  try {
    const { sessionId, pin, role } = await request.json();

    if (!sessionId || !pin || !role) {
      return NextResponse.json({ success: false, error: 'Missing required fields' }, { status: 400 });
    }

    const ip = getClientIp(request);
    // Normalise session identifier for rate limiting (always use the code form)
    const sessionCode = isUUID(sessionId) ? sessionId : sessionId.toUpperCase();

    // Check rate limit before touching secrets
    const rateCheck = await checkRateLimit(sessionCode, ip);
    if (rateCheck.limited) {
      return NextResponse.json({ success: false, error: rateCheck.reason }, { status: 429 });
    }

    // Resolve session
    const column = isUUID(sessionId) ? 'id' : 'session_code';
    const lookupValue = isUUID(sessionId) ? sessionId : sessionId.toUpperCase();

    const { data: session, error: sessionError } = await supabaseAdmin
      .from('sessions')
      .select('id, name, session_code')
      .eq(column, lookupValue)
      .single();

    if (sessionError || !session) {
      // Don't record attempt for non-existent sessions (can't tie to a real session code)
      return NextResponse.json({ success: false, error: 'Session not found' }, { status: 404 });
    }

    const resolvedSessionId = session.id;
    const resolvedSessionCode = session.session_code;
    const sessionName = session.name;

    if (role === 'admin') {
      const { data: secret } = await supabaseAdmin
        .from('session_secrets')
        .select('admin_pin_hash')
        .eq('session_id', resolvedSessionId)
        .single();

      const valid = secret ? await bcrypt.compare(pin, secret.admin_pin_hash) : false;
      await recordAttempt(resolvedSessionCode, ip, valid);

      if (!valid) {
        return NextResponse.json({ success: false, error: 'Invalid PIN' }, { status: 401 });
      }

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
      const { data: judges } = await supabaseAdmin
        .from('judges')
        .select('id, name, session_id, judge_secrets(judge_pin_hash)')
        .eq('session_id', resolvedSessionId)
        .eq('is_active', true);

      let matchedJudge: { id: string; name: string; session_id: string } | null = null;
      for (const judge of (judges || [])) {
        const secret = (judge.judge_secrets as unknown as { judge_pin_hash: string } | null);
        if (secret && await bcrypt.compare(pin, secret.judge_pin_hash)) {
          matchedJudge = judge;
          break;
        }
      }

      await recordAttempt(resolvedSessionCode, ip, !!matchedJudge);

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
