import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '@/lib/supabase/admin';

export async function GET() {
  const results: Record<string, unknown> = {};

  // Check env vars availability
  results.envVars = {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ? 'SET' : 'MISSING',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
      ? `SET (${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY.slice(0, 10)}...)`
      : 'MISSING',
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ? 'SET' : 'MISSING',
    JWT_SECRET: process.env.JWT_SECRET ? 'SET' : 'MISSING',
  };

  // Test service role client (known working)
  try {
    const { data, error } = await supabaseAdmin
      .from('sessions')
      .select('id, name')
      .limit(1);
    results.serviceRoleRead = error
      ? { status: 'ERROR', error: error.message, code: error.code }
      : { status: 'OK', rowCount: data?.length ?? 0 };
  } catch (e) {
    results.serviceRoleRead = { status: 'EXCEPTION', error: String(e) };
  }

  // Test anon client (suspected broken)
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) {
      results.anonClientRead = { status: 'SKIPPED', reason: 'Missing env vars' };
    } else {
      const anonClient = createClient(url, key);
      const { data, error } = await anonClient
        .from('sessions')
        .select('id, name')
        .limit(1);
      results.anonClientRead = error
        ? { status: 'ERROR', error: error.message, code: error.code, details: error.details, hint: error.hint }
        : { status: 'OK', rowCount: data?.length ?? 0 };
    }
  } catch (e) {
    results.anonClientRead = { status: 'EXCEPTION', error: String(e) };
  }

  return NextResponse.json(results, { status: 200 });
}
