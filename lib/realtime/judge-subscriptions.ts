'use client';

import { supabase } from '@/lib/supabase/client';
import { RealtimeChannel } from '@supabase/supabase-js';

export function subscribeToGroupChanges(
  sessionId: string,
  onGroupUpdate: (payload: { new: Record<string, unknown> }) => void
): RealtimeChannel {
  return supabase
    .channel(`session:${sessionId}:groups`)
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'dancer_groups',
      filter: `session_id=eq.${sessionId}`,
    }, onGroupUpdate)
    .subscribe();
}

export function subscribeToSessionChanges(
  sessionId: string,
  onSessionUpdate: (payload: { new: Record<string, unknown> }) => void
): RealtimeChannel {
  return supabase
    .channel(`session:${sessionId}:status`)
    .on('postgres_changes', {
      event: 'UPDATE',
      schema: 'public',
      table: 'sessions',
      filter: `id=eq.${sessionId}`,
    }, onSessionUpdate)
    .subscribe();
}
