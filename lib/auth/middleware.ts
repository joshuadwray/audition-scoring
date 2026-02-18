import { NextResponse } from 'next/server';
import { validateAndExtractToken, requireAdmin, requireJudge } from './session';

export function withAuth(handler: (request: Request, token: ReturnType<typeof validateAndExtractToken>) => Promise<Response>) {
  return async (request: Request) => {
    const token = validateAndExtractToken(request);
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return handler(request, token);
  };
}

export function withAdmin(handler: (request: Request, token: ReturnType<typeof requireAdmin>) => Promise<Response>) {
  return async (request: Request) => {
    try {
      const token = requireAdmin(request);
      return handler(request, token);
    } catch {
      return NextResponse.json({ error: 'Unauthorized: Admin access required' }, { status: 401 });
    }
  };
}

export function withJudge(handler: (request: Request, token: ReturnType<typeof requireJudge>) => Promise<Response>) {
  return async (request: Request) => {
    try {
      const token = requireJudge(request);
      return handler(request, token);
    } catch {
      return NextResponse.json({ error: 'Unauthorized: Judge access required' }, { status: 401 });
    }
  };
}
