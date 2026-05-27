import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { requireAdmin } from '@/lib/auth/session';
import { decryptPin } from '@/lib/crypto/pin-encryption';

// Throttle: admins shouldn't legitimately reveal more than this many PINs
// per session per minute. A scripted dump attempt blows past this fast.
const MAX_REVEALS_PER_SESSION_PER_MINUTE = 30;

/**
 * POST /api/judges/[id]/reveal-pin
 *
 * Admin-only endpoint that decrypts and returns the plaintext PIN for a
 * judge. Every successful reveal is recorded in admin_actions for audit
 * purposes. Returns 410 Gone for legacy judges that predate migration 011
 * and therefore have no encrypted copy stored — admin should use the
 * reset-pin endpoint instead.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = requireAdmin(request);
    const { id } = await params;

    // Verify judge exists and belongs to admin's session
    const { data: judge } = await supabaseAdmin
      .from('judges')
      .select('id, session_id, name')
      .eq('id', id)
      .single();

    if (!judge) {
      return NextResponse.json({ error: 'Judge not found' }, { status: 404 });
    }

    if (judge.session_id !== admin.sessionId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Rate limit: count reveals for this session in the past minute via
    // admin_actions (which is also where the audit row goes). Reusing the
    // audit table avoids a second table; the index on (session_id, created_at)
    // from the original schema keeps the count fast.
    const oneMinuteAgo = new Date(Date.now() - 60 * 1000).toISOString();
    const { count: recentReveals } = await supabaseAdmin
      .from('admin_actions')
      .select('id', { count: 'exact', head: true })
      .eq('session_id', admin.sessionId)
      .eq('action_type', 'judge_pin_reveal')
      .gte('created_at', oneMinuteAgo);

    if ((recentReveals ?? 0) >= MAX_REVEALS_PER_SESSION_PER_MINUTE) {
      return NextResponse.json(
        { error: 'Too many PIN reveals in the last minute. Wait and retry.' },
        { status: 429 }
      );
    }

    // Load the encrypted PIN
    const { data: secret } = await supabaseAdmin
      .from('judge_secrets')
      .select('judge_pin_encrypted')
      .eq('judge_id', id)
      .single();

    if (!secret?.judge_pin_encrypted) {
      return NextResponse.json(
        {
          error: 'This judge has no recoverable PIN. Use Reset PIN to generate a new one.',
          legacy: true,
        },
        { status: 410 }
      );
    }

    let pin: string;
    try {
      pin = decryptPin(secret.judge_pin_encrypted);
    } catch (err) {
      console.error('judges.reveal-pin.decrypt', err);
      return NextResponse.json({ error: 'Failed to decrypt PIN' }, { status: 500 });
    }

    // Audit log — write AFTER successful decrypt so we don't log spurious
    // attempts. Includes judge id + name for forensic readability; no PIN.
    await supabaseAdmin.from('admin_actions').insert({
      session_id: admin.sessionId,
      action_type: 'judge_pin_reveal',
      details: { judge_id: id, judge_name: judge.name },
    });

    return NextResponse.json({ pin });
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
