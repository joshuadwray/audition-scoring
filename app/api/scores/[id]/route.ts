import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { validateAndExtractToken } from '@/lib/auth/session';
import { SCORE_CATEGORIES } from '@/lib/database.types';
import { isValidScore } from '@/lib/scoring/validation';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const groupId = searchParams.get('groupId');
  const judgeId = searchParams.get('judgeId');
  const dancerId = searchParams.get('dancerId');

  let query = supabaseAdmin.from('scores').select('*');

  if (id !== 'list') {
    query = query.eq('id', id);
  } else {
    if (groupId) query = query.eq('group_id', groupId);
    if (judgeId) query = query.eq('judge_id', judgeId);
    if (dancerId) query = query.eq('dancer_id', dancerId);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const token = validateAndExtractToken(request);
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get the score to check ownership and session lock status
    const { data: score } = await supabaseAdmin
      .from('scores')
      .select('*, dancer_groups(session_id)')
      .eq('id', id)
      .single();

    if (!score) {
      return NextResponse.json({ error: 'Score not found' }, { status: 404 });
    }

    const sessionId = (score.dancer_groups as unknown as { session_id: string }).session_id;

    // Check session lock
    const { data: session } = await supabaseAdmin
      .from('sessions')
      .select('is_locked')
      .eq('id', sessionId)
      .single();

    if (session?.is_locked) {
      return NextResponse.json({ error: 'Session is locked. No further edits allowed.' }, { status: 403 });
    }

    // If judge, verify they own the score
    if (token.role === 'judge' && score.judge_id !== token.judgeId) {
      return NextResponse.json({ error: 'Cannot edit another judge\'s score' }, { status: 403 });
    }

    const updates = await request.json();

    // Validate score values
    for (const cat of SCORE_CATEGORIES) {
      if (updates[cat] !== undefined) {
        if (!isValidScore(updates[cat])) {
          return NextResponse.json({ error: `Invalid score for ${cat}: must be 1-5 in 0.5 increments` }, { status: 400 });
        }
      }
    }

    const { data, error } = await supabaseAdmin
      .from('scores')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Log if admin edited
    if (token.role === 'admin') {
      await supabaseAdmin.from('admin_actions').insert({
        session_id: sessionId,
        action_type: 'edit_score',
        details: { score_id: id, updates },
      });
    }

    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
