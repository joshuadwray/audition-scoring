import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

// Never serve this from a cache — a cached response would look healthy while the
// database sees no activity at all, which is the exact failure we're guarding against.
export const dynamic = 'force-dynamic';

const SOURCES = ['vercel', 'github', 'manual'] as const;
type Source = (typeof SOURCES)[number];

function noStore(body: unknown, status: number) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret) {
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${cronSecret}`) {
      return noStore({ error: 'Unauthorized' }, 401);
    }
  } else if (process.env.NODE_ENV === 'production') {
    // Fail closed. Previously a missing CRON_SECRET silently made this a public,
    // unauthenticated service-role endpoint.
    console.error('keepalive.config', 'CRON_SECRET is not set');
    return noStore({ ok: false, error: 'CRON_SECRET is not configured' }, 500);
  }

  // An explicit ?source= wins (GitHub Actions sets it). Vercel Cron can't pass query
  // params reliably — its `path` config is validated — so it's identified by user-agent.
  // Anything else is a human with curl, recorded separately so it doesn't pollute the
  // "is the scheduler healthy?" signal.
  const requested = new URL(request.url).searchParams.get('source');
  const userAgent = request.headers.get('user-agent') ?? '';
  const source: Source = SOURCES.includes(requested as Source)
    ? (requested as Source)
    : userAgent.includes('vercel-cron')
      ? 'vercel'
      : 'manual';

  const { data, error } = await supabaseAdmin
    .rpc('keepalive_ping', { p_source: source })
    .single();

  if (error) {
    console.error('keepalive.ping', source, error);
    return noStore({ ok: false, source, error: error.message }, 500);
  }

  const row = data as { last_ping_at: string; ping_count: number } | null;

  return noStore(
    {
      ok: true,
      source,
      last_ping_at: row?.last_ping_at ?? null,
      ping_count: row?.ping_count ?? null,
      ts: new Date().toISOString(),
    },
    200
  );
}
