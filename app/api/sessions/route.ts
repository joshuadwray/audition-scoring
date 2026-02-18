import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

export async function GET() {
  const { data, error } = await supabaseAdmin
    .from('sessions')
    .select('id, session_code, name, date, status, is_locked, created_at')
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

export async function POST(request: Request) {
  try {
    const { name, date, adminPin, sessionCode } = await request.json();

    if (!name || !date || !adminPin || !sessionCode) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    if (adminPin.length !== 6 || !/^\d+$/.test(adminPin)) {
      return NextResponse.json({ error: 'Admin PIN must be exactly 6 digits' }, { status: 400 });
    }

    // Validate session code: alphanumeric + hyphens, 3-20 chars
    if (!/^[a-zA-Z0-9-]{3,20}$/.test(sessionCode)) {
      return NextResponse.json({ error: 'Session code must be 3-20 characters (letters, numbers, hyphens)' }, { status: 400 });
    }

    // Check uniqueness
    const { data: existing } = await supabaseAdmin
      .from('sessions')
      .select('id')
      .eq('session_code', sessionCode.toUpperCase())
      .single();

    if (existing) {
      return NextResponse.json({ error: 'Session code already in use' }, { status: 409 });
    }

    const { data, error } = await supabaseAdmin
      .from('sessions')
      .insert({ name, date, admin_pin: adminPin, session_code: sessionCode.toUpperCase() })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
