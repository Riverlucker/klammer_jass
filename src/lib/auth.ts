import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import type { NextRequest, NextResponse } from 'next/server';
import type { PlayerID } from '@/game/types';

const COOKIE_PREFIX = 'jass_session_';
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

export interface MatchAccess {
  player1TokenHash: string | null;
  player2TokenHash: string | null;
}

export function createPlayerToken() {
  const token = randomBytes(32).toString('base64url');
  return { token, tokenHash: hashPlayerToken(token) };
}

export function resolvePlayerID(access: MatchAccess, token: string | undefined): PlayerID | null {
  if (!token) return null;
  const tokenHash = hashPlayerToken(token);
  if (safeHashEqual(access.player1TokenHash, tokenHash)) return '0';
  if (safeHashEqual(access.player2TokenHash, tokenHash)) return '1';
  return null;
}

export function normalizePlayerName(name: string): { name: string; normalizedName: string } {
  const displayName = name.normalize('NFKC').trim().replace(/\s+/g, ' ');
  return { name: displayName, normalizedName: displayName.toLocaleLowerCase('de-AT') };
}

export function createPasswordHash(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64);
  return `scrypt$${salt.toString('base64url')}$${hash.toString('base64url')}`;
}

export function verifyPassword(password: string, storedValue: string): boolean {
  const [algorithm, saltValue, hashValue] = storedValue.split('$');
  if (algorithm !== 'scrypt' || !saltValue || !hashValue) return false;
  try {
    const expected = Buffer.from(hashValue, 'base64url');
    const actual = scryptSync(password, Buffer.from(saltValue, 'base64url'), expected.length);
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

export function readMatchToken(request: NextRequest, matchId: string): string | undefined {
  return request.cookies.get(cookieName(matchId))?.value;
}

export function setMatchCookie(response: NextResponse, matchId: string, token: string) {
  response.cookies.set({
    name: cookieName(matchId),
    value: token,
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

function hashPlayerToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function safeHashEqual(storedHash: string | null, candidateHash: string): boolean {
  if (!storedHash) return false;
  const stored = Buffer.from(storedHash, 'hex');
  const candidate = Buffer.from(candidateHash, 'hex');
  return stored.length === candidate.length && timingSafeEqual(stored, candidate);
}

function cookieName(matchId: string): string {
  return `${COOKIE_PREFIX}${matchId}`;
}
