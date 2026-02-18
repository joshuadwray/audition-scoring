import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { requireAdmin, createToken } from '@/lib/auth/session';

function generatePin(): string {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get('sessionId');

  if (!sessionId) {
    return NextResponse.json({ error: 'sessionId required' }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from('judges')
    .select('*')
    .eq('session_id', sessionId)
    .order('created_at');

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

export async function POST(request: Request) {
  try {
    const adminPayload = requireAdmin(request);
    const { name, sessionId, isAdminJudge } = await request.json();

    if (!name || !sessionId) {
      return NextResponse.json({ error: 'name and sessionId required' }, { status: 400 });
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

    // Generate unique PIN for this session
    let pin = generatePin();
    let attempts = 0;
    while (attempts < 10) {
      const { data: existing } = await supabaseAdmin
        .from('judges')
        .select('id')
        .eq('session_id', sessionId)
        .eq('judge_pin', pin)
        .single();

      if (!existing) break;
      pin = generatePin();
      attempts++;
    }

    const { data, error } = await supabaseAdmin
      .from('judges')
      .insert({
        session_id: sessionId,
        name,
        judge_pin: pin,
        is_admin_judge: isAdminJudge || false,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // If admin-judge, return a new admin token with judgeId
    if (isAdminJudge) {
      const newToken = createToken({
        sessionId: adminPayload.sessionId,
        role: 'admin',
        judgeId: data.id,
        judgeName: data.name,
      });
      return NextResponse.json({ ...data, token: newToken }, { status: 201 });
    }

    return NextResponse.json(data, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}

export async function DELETE(request: Request) {
  try {
    requireAdmin(request);
    const { searchParams } = new URL(request.url);
    const judgeId = searchParams.get('id');

    if (!judgeId) {
      return NextResponse.json({ error: 'Judge id required' }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from('judges')
      .update({ is_active: false })
      .eq('id', judgeId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
