import { NextResponse } from 'next/server';
import { randomInt } from 'crypto';
import bcrypt from 'bcryptjs';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { requireAdmin } from '@/lib/auth/session';
import { encryptPin } from '@/lib/crypto/pin-encryption';

function generatePin(): string {
  return String(randomInt(1000, 10000));
}

/**
 * POST /api/judges/[id]/reset-pin
 *
 * Admin-driven PIN regeneration. Generates a fresh 4-digit PIN, ensures
 * uniqueness within the session, replaces both the bcrypt hash and the
 * encrypted-at-rest copy, audits the action, and returns the new plaintext
 * PIN once.
 *
 * Use cases:
 *   - Legacy judges with no encrypted PIN (predate migration 011)
 *   - Judge forgot their PIN and admin needs to issue a new one
 *   - PIN compromise / rotation
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = requireAdmin(request);
    const { id } = await params;

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

    // Generate a fresh PIN, ensuring it doesn't collide with another judge
    // in the same session (compare against stored hashes since we can't
    // list plaintext PINs we don't already have).
    const { data: otherSecrets } = await supabaseAdmin
      .from('judges')
      .select('id, judge_secrets(judge_pin_hash)')
      .eq('session_id', judge.session_id)
      .eq('is_active', true)
      .neq('id', id);

    let pin = generatePin();
    let attempts = 0;
    while (attempts < 10) {
      let conflict = false;
      for (const j of (otherSecrets || [])) {
        const secret = (j.judge_secrets as unknown as { judge_pin_hash: string } | null);
        if (secret && await bcrypt.compare(pin, secret.judge_pin_hash)) {
          conflict = true;
          break;
        }
      }
      if (!conflict) break;
      pin = generatePin();
      attempts++;
    }

    const pinHash = await bcrypt.hash(pin, 12);
    const pinEncrypted = encryptPin(pin);

    // Upsert: row already exists for judges created post-008, may not exist
    // for unusual edge cases. ON CONFLICT (judge_id) refreshes both fields.
    const { error } = await supabaseAdmin
      .from('judge_secrets')
      .upsert(
        {
          judge_id: id,
          judge_pin_hash: pinHash,
          judge_pin_encrypted: pinEncrypted,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'judge_id' }
      );

    if (error) {
      console.error('judges.reset-pin', error);
      return NextResponse.json({ error: 'Failed to reset PIN' }, { status: 500 });
    }

    await supabaseAdmin.from('admin_actions').insert({
      session_id: admin.sessionId,
      action_type: 'judge_pin_reset',
      details: { judge_id: id, judge_name: judge.name },
    });

    return NextResponse.json({ pin });
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
