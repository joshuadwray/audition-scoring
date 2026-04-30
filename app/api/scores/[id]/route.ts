import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { validateAndExtractToken } from '@/lib/auth/session';
import { SCORE_CATEGORIES } from '@/lib/database.types';
import { isValidScore } from '@/lib/scoring/validation';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const token = validateAndExtractToken(request);
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

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
      console.error('scores.list', error);
      return NextResponse.json({ error: 'Failed to fetch scores' }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
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

    // Load score to verify ownership and session
    const { data: score } = await supabaseAdmin
      .from('scores')
      .select('*, dancer_groups(session_id)')
      .eq('id', id)
      .single();

    if (!score) {
      return NextResponse.json({ error: 'Score not found' }, { status: 404 });
    }

    const sessionId = (score.dancer_groups as unknown as { session_id: string }).session_id;

    // Verify token belongs to this session
    if (token.sessionId !== sessionId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Check session lock
    const { data: session } = await supabaseAdmin
      .from('sessions')
      .select('is_locked')
      .eq('id', sessionId)
      .single();

    if (session?.is_locked) {
      return NextResponse.json({ error: 'Session is locked. No further edits allowed.' }, { status: 403 });
    }

    // Judges may only edit their own scores
    if (token.role === 'judge' && score.judge_id !== token.judgeId) {
      return NextResponse.json({ error: 'Cannot edit another judge\'s score' }, { status: 403 });
    }

    const body = await request.json();

    // Allow-list: only score category fields may be updated
    const safeUpdates: Record<string, unknown> = {};
    for (const cat of SCORE_CATEGORIES) {
      if (body[cat] !== undefined) {
        if (!isValidScore(body[cat])) {
          return NextResponse.json({ error: `Invalid score for ${cat}: must be 1-5 in 0.5 increments` }, { status: 400 });
        }
        safeUpdates[cat] = body[cat];
      }
    }

    const { data, error } = await supabaseAdmin
      .from('scores')
      .update({ ...safeUpdates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('scores.update', error);
      return NextResponse.json({ error: 'Failed to update score' }, { status: 500 });
    }

    if (token.role === 'admin') {
      await supabaseAdmin.from('admin_actions').insert({
        session_id: sessionId,
        action_type: 'edit_score',
        details: { score_id: id, updates: safeUpdates },
      });
    }

    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
