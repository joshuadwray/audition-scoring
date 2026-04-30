import { NextResponse } from 'next/server';
import { randomInt } from 'crypto';
import bcrypt from 'bcryptjs';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { requireAdmin, createToken } from '@/lib/auth/session';

function generatePin(): string {
  return String(randomInt(1000, 10000));
}

export async function GET(request: Request) {
  try {
    const token = requireAdmin(request);
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get('sessionId');

    if (!sessionId) {
      return NextResponse.json({ error: 'sessionId required' }, { status: 400 });
    }

    if (token.sessionId !== sessionId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { data, error } = await supabaseAdmin
      .from('judges')
      .select('id, session_id, name, is_active, is_admin_judge, created_at')
      .eq('session_id', sessionId)
      .order('created_at');

    if (error) {
      console.error('judges.list', error);
      return NextResponse.json({ error: 'Failed to list judges' }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}

export async function POST(request: Request) {
  try {
    const adminPayload = requireAdmin(request);
    const { name, sessionId, isAdminJudge } = await request.json();

    if (!name || !sessionId) {
      return NextResponse.json({ error: 'name and sessionId required' }, { status: 400 });
    }

    if (adminPayload.sessionId !== sessionId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // If creating an admin-judge, check if one already exists
    if (isAdminJudge) {
      const { data: existing } = await supabaseAdmin
        .from('judges')
        .select('id, name')
        .eq('session_id', sessionId)
        .eq('is_admin_judge', true)
        .eq('is_active', true)
        .single();

      if (existing) {
        const newToken = createToken({
          sessionId: adminPayload.sessionId,
          role: 'admin',
          judgeId: existing.id,
          judgeName: existing.name,
        });
        return NextResponse.json({ ...existing, token: newToken }, { status: 200 });
      }
    }

    // Generate PIN, ensure uniqueness within session (compare hashes not possible — compare plaintext only at creation time)
    const existingHashes = await supabaseAdmin
      .from('judges')
      .select('id, judge_secrets(judge_pin_hash)')
      .eq('session_id', sessionId)
      .eq('is_active', true);

    let pin = generatePin();
    let attempts = 0;
    // Uniqueness check: try up to 10 candidates, each compared against existing hashes
    while (attempts < 10) {
      let conflict = false;
      for (const j of (existingHashes.data || [])) {
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

    const { data: judge, error: judgeError } = await supabaseAdmin
      .from('judges')
      .insert({
        session_id: sessionId,
        name,
        is_admin_judge: isAdminJudge || false,
      })
      .select('id, session_id, name, is_active, is_admin_judge, created_at')
      .single();

    if (judgeError) {
      console.error('judges.create', judgeError);
      return NextResponse.json({ error: 'Failed to create judge' }, { status: 500 });
    }

    // Hash and store PIN
    const pinHash = await bcrypt.hash(pin, 12);
    const { error: secretError } = await supabaseAdmin
      .from('judge_secrets')
      .insert({ judge_id: judge.id, judge_pin_hash: pinHash });

    if (secretError) {
      await supabaseAdmin.from('judges').delete().eq('id', judge.id);
      console.error('judges.create.secret', secretError);
      return NextResponse.json({ error: 'Failed to create judge' }, { status: 500 });
    }

    // If admin-judge, return a new admin token with judgeId
    if (isAdminJudge) {
      const newToken = createToken({
        sessionId: adminPayload.sessionId,
        role: 'admin',
        judgeId: judge.id,
        judgeName: judge.name,
      });
      // Return judge with plaintext PIN — only time it's visible
      return NextResponse.json({ ...judge, judge_pin: pin, token: newToken }, { status: 201 });
    }

    // Return judge with plaintext PIN — only time it's visible
    return NextResponse.json({ ...judge, judge_pin: pin }, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}

export async function DELETE(request: Request) {
  try {
    const token = requireAdmin(request);
    const { searchParams } = new URL(request.url);
    const judgeId = searchParams.get('id');

    if (!judgeId) {
      return NextResponse.json({ error: 'Judge id required' }, { status: 400 });
    }

    // Verify judge belongs to admin's session
    const { data: judge } = await supabaseAdmin
      .from('judges')
      .select('session_id')
      .eq('id', judgeId)
      .single();

    if (!judge || judge.session_id !== token.sessionId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { error } = await supabaseAdmin
      .from('judges')
      .update({ is_active: false })
      .eq('id', judgeId);

    if (error) {
      console.error('judges.delete', error);
      return NextResponse.json({ error: 'Failed to remove judge' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
