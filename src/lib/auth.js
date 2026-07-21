import { CONFIG } from './config.js';
import { signToken, verifyToken } from './jwt.js';
import { respondError } from './utils.js';

const COOKIE_RE = /(?:^|;\s*)checkin_auth=([^;]*)/;

// Full auth requires the JWT (X-Auth-Token header or cookie) plus the matching
// session nonce header. The header fallback keeps sessions working when a
// browser drops or withholds the cookie.
export async function authMiddleware(c, next) {
  const secret = c.env.JWT_SECRET;
  if (typeof secret !== 'string' || !secret) {
    return respondError(c, 'Server Not Configured', 500);
  }

  const headerToken = c.req.header('X-Auth-Token');
  const token = (headerToken && headerToken.trim()) || parseCookie(c.req.header('Cookie'));
  const nonce = c.req.header('X-Session-Nonce');
  if (!token || !nonce) {
    return respondError(c, 'Unauthorized', 401);
  }

  const payload = await verifyToken(token, secret);
  if (!payload || payload.nonce !== nonce) {
    return respondError(c, 'Unauthorized', 401);
  }

  await next();

  if (shouldRefreshToken(payload)) {
    const refreshedToken = await signToken(secret, nonce);
    setAuthCookie(c, refreshedToken);
    c.header('X-Auth-Token', refreshedToken);
  }
}

function parseCookie(cookieStr) {
  if (!cookieStr) return null;
  const match = cookieStr.match(COOKIE_RE);
  return match ? match[1] : null;
}

function shouldRefreshToken(payload) {
  const expSec = Number(payload?.exp);
  if (!Number.isFinite(expSec)) return false;
  return expSec - Math.floor(Date.now() / 1000) <= CONFIG.JWT_REFRESH_THRESHOLD;
}

export function setAuthCookie(c, token) {
  const cookieOpts = [
    `checkin_auth=${token}`,
    'HttpOnly',
    ...(isHttpsRequest(c) ? ['Secure'] : []),
    'SameSite=Lax',
    `Max-Age=${CONFIG.JWT_EXP}`,
    'Path=/'
  ].join('; ');
  c.header('Set-Cookie', cookieOpts);
}

function isHttpsRequest(c) {
  const forwardedProto = (c.req.header('x-forwarded-proto') || '').split(',')[0].trim().toLowerCase();
  if (forwardedProto) return forwardedProto === 'https';
  try { return new URL(c.req.url).protocol === 'https:'; } catch { return true; }
}
