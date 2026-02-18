import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { requireJudge } from '@/lib/auth/session';
import { SCORE_CATEGORIES } from '@/lib/database.types';
import { isValidScore } from '@/lib/scoring/validation';

export async function POST(request: Request) {
  try {
    const token = requireJudge(request);
    const { groupId, judgeId, scores } = await request.json();

    // Validate judge identity
    if (judgeId !== token.judgeId) {
      return NextResponse.json({ error: 'Judge ID mismatch' }, { status: 403 });
    }

    // Validate session not locked
    const { data: group } = await supabaseAdmin
      .from('dancer_groups')
      .select('session_id, status')
      .eq('id', groupId)
      .single();

    if (!group) {
      return NextResponse.json({ error: 'Group not found' }, { status: 404 });
    }

    const { data: session } = await supabaseAdmin
      .from('sessions')
      .select('is_locked')
      .eq('id', group.session_id)
      .single();

    if (session?.is_locked) {
      return NextResponse.json({ error: 'Session is locked. No further edits allowed.' }, { status: 403 });
    }

    // Validate all scores
    if (!Array.isArray(scores) || scores.length === 0) {
      return NextResponse.json({ error: 'Scores array required' }, { status: 400 });
    }

    for (const score of scores) {
      if (!score.dancerId) {
        return NextResponse.json({ error: 'Each score must have a dancerId' }, { status: 400 });
      }
      for (const cat of SCORE_CATEGORIES) {
        if (!score[cat] || !isValidScore(score[cat])) {
          return NextResponse.json({ error: `Invalid score for ${cat}: must be 1-5 in 0.5 increments` }, { status: 400 });
        }
      }
    }

    // Check for duplicate submission
    const { data: existingSubmission } = await supabaseAdmin
      .from('score_submissions')
      .select('id')
      .eq('group_id', groupId)
      .eq('judge_id', judgeId)
      .single();

    if (existingSubmission) {
      return NextResponse.json({ error: 'Scores already submitted for this group' }, { status: 409 });
    }

    // Batch insert scores
    const scoreRows = scores.map((s: Record<string, unknown>) => ({
      group_id: groupId,
      judge_id: judgeId,
      dancer_id: s.dancerId,
      technique: s.technique,
      musicality: s.musicality,
      expression: s.expression,
      timing: s.timing,
      presentation: s.presentation,
    }));

    const { error: insertError } = await supabaseAdmin
      .from('scores')
      .insert(scoreRows);

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    // Record submission
    const { error: subError } = await supabaseAdmin
      .from('score_submissions')
      .insert({
        group_id: groupId,
        judge_id: judgeId,
        score_count: scores.length,
      });

    if (subError) {
      return NextResponse.json({ error: subError.message }, { status: 500 });
    }

    // Check if all judges have submitted
    const { data: completionStatus } = await supabaseAdmin
      .rpc('get_group_completion_status', { p_group_id: groupId });

    if (completionStatus && completionStatus.length > 0 && completionStatus[0].is_complete) {
      await supabaseAdmin
        .from('dancer_groups')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', groupId);
    }

    return NextResponse.json({ success: true, scoreCount: scores.length });
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
