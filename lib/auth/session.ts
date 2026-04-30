import jwt from 'jsonwebtoken';
import { TokenPayload } from '@/lib/database.types';

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET.length < 32) {
  throw new Error('JWT_SECRET env var must be set to at least 32 characters');
}

export function createToken(payload: Omit<TokenPayload, 'iat' | 'exp'>): string {
  return jwt.sign(payload, JWT_SECRET!, { expiresIn: '12h' });
}

export function verifyToken(token: string): TokenPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET!) as TokenPayload;
  } catch {
    return null;
  }
}

export function extractTokenFromHeader(authHeader: string | null): string | null {
  if (!authHeader?.startsWith('Bearer ')) return null;
  return authHeader.slice(7);
}

export function validateAndExtractToken(request: Request): TokenPayload | null {
  const authHeader = request.headers.get('Authorization');
  const token = extractTokenFromHeader(authHeader);
  if (!token) return null;
  return verifyToken(token);
}

export function requireAdmin(request: Request): TokenPayload {
  const payload = validateAndExtractToken(request);
  if (!payload || payload.role !== 'admin') {
    throw new Error('Unauthorized: Admin access required');
  }
  return payload;
}

/** requireAdmin + enforces token.sessionId === sessionId */
export function requireSessionAdmin(request: Request, sessionId: string): TokenPayload {
  const payload = requireAdmin(request);
  if (payload.sessionId !== sessionId) {
    throw new Error('Forbidden: session mismatch');
  }
  return payload;
}

export function requireJudge(request: Request): TokenPayload {
  const payload = validateAndExtractToken(request);
  if (!payload) {
    throw new Error('Unauthorized: Judge access required');
  }
  // Accept judge role, or admin role with a judgeId (admin acting as judge)
  if (payload.role === 'judge') return payload;
  if (payload.role === 'admin' && payload.judgeId) return payload;
  throw new Error('Unauthorized: Judge access required');
}

/** requireJudge + enforces token.sessionId === sessionId */
export function requireSessionJudge(request: Request, sessionId: string): TokenPayload {
  const payload = requireJudge(request);
  if (payload.sessionId !== sessionId) {
    throw new Error('Forbidden: session mismatch');
  }
  return payload;
}
