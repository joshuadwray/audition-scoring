import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { pin } = await request.json();

    const adminCreatePin = process.env.ADMIN_CREATE_PIN;

    // If no env var set, gate is disabled (dev convenience)
    if (!adminCreatePin) {
      return NextResponse.json({ success: true });
    }

    if (!pin) {
      return NextResponse.json({ success: false, error: 'PIN required' }, { status: 400 });
    }

    if (pin !== adminCreatePin) {
      return NextResponse.json({ success: false, error: 'Invalid PIN' }, { status: 401 });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
