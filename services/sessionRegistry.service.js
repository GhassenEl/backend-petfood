const { randomUUID } = require('crypto');

const MAX_SESSIONS = 200;
const sessions = new Map();
const revokedJtis = new Set();

function parseDevice(userAgent = '') {
  const ua = String(userAgent);
  if (/iPhone|iPad/i.test(ua)) return `Safari · ${/iPhone/i.test(ua) ? 'iPhone' : 'iPad'}`;
  if (/Android/i.test(ua)) return 'Chrome · Android';
  if (/Firefox/i.test(ua)) return 'Firefox';
  if (/Edg/i.test(ua)) return 'Edge · Windows';
  if (/Chrome/i.test(ua)) return 'Chrome · Windows';
  if (/Safari/i.test(ua)) return 'Safari · macOS';
  return ua.slice(0, 48) || 'Navigateur inconnu';
}

function maskIp(ip) {
  if (!ip || ip === 'unknown') return '—';
  const parts = String(ip).split('.');
  if (parts.length === 4) return `${parts[0]}.${parts[1]}.*.*`;
  return String(ip).slice(0, 12);
}

function registerSession({
  jti,
  userId,
  email,
  role,
  ip,
  userAgent,
} = {}) {
  if (!jti) return null;
  const row = {
    id: jti,
    jti,
    userId: String(userId),
    user: email,
    role,
    device: parseDevice(userAgent),
    ip: maskIp(ip),
    rawIp: ip || null,
    userAgent: String(userAgent || '').slice(0, 160),
    createdAt: new Date().toISOString(),
    lastActive: new Date().toISOString(),
    current: false,
  };
  sessions.set(jti, row);
  if (sessions.size > MAX_SESSIONS) {
    const oldest = [...sessions.values()].sort(
      (a, b) => new Date(a.lastActive).getTime() - new Date(b.lastActive).getTime(),
    )[0];
    if (oldest?.jti) sessions.delete(oldest.jti);
  }
  return row;
}

function touchSession(jti) {
  const row = sessions.get(jti);
  if (!row) return null;
  row.lastActive = new Date().toISOString();
  sessions.set(jti, row);
  return row;
}

function isSessionRevoked(jti) {
  return Boolean(jti && revokedJtis.has(jti));
}

function revokeSession(jti, { requesterId, isAdmin = false } = {}) {
  const row = sessions.get(jti);
  if (!row) {
    revokedJtis.add(jti);
    return { ok: true, id: jti };
  }
  if (!isAdmin && String(row.userId) !== String(requesterId)) {
    const err = new Error('Not authorized to revoke this session');
    err.status = 403;
    throw err;
  }
  revokedJtis.add(jti);
  sessions.delete(jti);
  return { ok: true, id: jti, user: row.user };
}

function listSessions({ userId, adminView = false, currentJti = null } = {}) {
  const rows = [...sessions.values()]
    .filter((s) => !revokedJtis.has(s.jti))
    .filter((s) => adminView || String(s.userId) === String(userId))
    .sort((a, b) => new Date(b.lastActive).getTime() - new Date(a.lastActive).getTime())
    .map((s) => ({
      ...s,
      current: currentJti ? s.jti === currentJti : false,
    }));
  return rows.slice(0, 50);
}

function revokeAllForUser(userId, exceptJti = null) {
  let count = 0;
  sessions.forEach((row, jti) => {
    if (String(row.userId) === String(userId) && jti !== exceptJti) {
      revokedJtis.add(jti);
      sessions.delete(jti);
      count += 1;
    }
  });
  return count;
}

module.exports = {
  registerSession,
  touchSession,
  isSessionRevoked,
  revokeSession,
  listSessions,
  revokeAllForUser,
};
