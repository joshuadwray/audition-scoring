import jwt from 'jsonwebtoken';
import { TokenPayload } from '@/lib/database.types';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';

export function createToken(payload: Omit<TokenPayload, 'iat' | 'exp'>): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '24h' });
}

export function verifyToken(token: string): TokenPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as TokenPayload;
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
