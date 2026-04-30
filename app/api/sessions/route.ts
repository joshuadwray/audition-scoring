import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { supabaseAdmin } from '@/lib/supabase/admin';

export async function GET() {
  const { data, error } = await supabaseAdmin
    .from('sessions')
    .select('id, session_code, name, date, status, is_locked, created_at')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('sessions.list', error);
    return NextResponse.json({ error: 'Failed to list sessions' }, { status: 500 });
  }

  return NextResponse.json(data);
}

export async function POST(request: Request) {
  try {
    const { name, date, adminPin, sessionCode, createPin } = await request.json();

    // Server-side ADMIN_CREATE_PIN gate — fail closed in production
    const adminCreatePin = process.env.ADMIN_CREATE_PIN;
    if (!adminCreatePin) {
      if (process.env.NODE_ENV === 'production') {
        return NextResponse.json({ error: 'Session creation is not configured' }, { status: 503 });
      }
      // Dev-only: allow without PIN if env var is not set
    } else {
      if (!createPin || createPin !== adminCreatePin) {
        return NextResponse.json({ error: 'Invalid create PIN' }, { status: 401 });
      }
    }

    if (!name || !date || !adminPin || !sessionCode) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    if (adminPin.length !== 6 || !/^\d+$/.test(adminPin)) {
      return NextResponse.json({ error: 'Admin PIN must be exactly 6 digits' }, { status: 400 });
    }

    // Reject trivially weak PINs
    if (/^(\d)\1{5}$/.test(adminPin) || adminPin === '123456' || adminPin === '654321') {
      return NextResponse.json({ error: 'Admin PIN is too simple. Choose a less predictable PIN.' }, { status: 400 });
    }

    if (!/^[a-zA-Z0-9-]{3,20}$/.test(sessionCode)) {
      return NextResponse.json({ error: 'Session code must be 3-20 characters (letters, numbers, hyphens)' }, { status: 400 });
    }

    // Check session code uniqueness
    const { data: existing } = await supabaseAdmin
      .from('sessions')
      .select('id')
      .eq('session_code', sessionCode.toUpperCase())
      .single();

    if (existing) {
      return NextResponse.json({ error: 'Session code already in use' }, { status: 409 });
    }

    // Create session without PIN (PIN goes in session_secrets)
    const { data: session, error: sessionError } = await supabaseAdmin
      .from('sessions')
      .insert({ name, date, session_code: sessionCode.toUpperCase() })
      .select('id, session_code, name, date, status, is_locked, created_at')
      .single();

    if (sessionError) {
      console.error('sessions.create', sessionError);
      return NextResponse.json({ error: 'Failed to create session' }, { status: 500 });
    }

    // Hash and store admin PIN
    const adminPinHash = await bcrypt.hash(adminPin, 12);
    const { error: secretError } = await supabaseAdmin
      .from('session_secrets')
      .insert({ session_id: session.id, admin_pin_hash: adminPinHash });

    if (secretError) {
      // Roll back session creation
      await supabaseAdmin.from('sessions').delete().eq('id', session.id);
      console.error('sessions.create.secret', secretError);
      return NextResponse.json({ error: 'Failed to create session' }, { status: 500 });
    }

    return NextResponse.json(session, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
