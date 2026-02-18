'use client';

import { supabase } from '@/lib/supabase/client';
import { RealtimeChannel } from '@supabase/supabase-js';

export function subscribeToSubmissions(
  sessionId: string,
  onSubmission: (payload: { new: Record<string, unknown> }) => void
): RealtimeChannel {
  return supabase
    .channel(`session:${sessionId}:submissions`)
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'score_submissions',
    }, onSubmission)
    .subscribe();
}

export function subscribeToGroupUpdates(
  sessionId: string,
  onGroupUpdate: (payload: { new: Record<string, unknown> }) => void
): RealtimeChannel {
  return supabase
    .channel(`admin:${sessionId}:groups`)
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'dancer_groups',
      filter: `session_id=eq.${sessionId}`,
    }, onGroupUpdate)
    .subscribe();
}
