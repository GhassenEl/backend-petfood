const { randomUUID } = require('crypto');
const { getNotificationIo } = require('../utils/notificationHub');

const STALE_MS = 90_000;
const ROLES = ['visitor', 'client', 'livreur', 'vet', 'moderator', 'vendor', 'admin'];

/** @type {Map<string, object>} */
const sessions = new Map();
const recentEvents = [];
const MAX_EVENTS = 80;

const pushEvent = (type, row) => {
  recentEvents.unshift({
    id: randomUUID(),
    type,
    at: new Date().toISOString(),
    role: row.role || 'visitor',
    name: row.name || 'Visiteur',
    region: row.region || 'Non assignée',
    path: row.path || '/',
    userId: row.userId || null,
  });
  if (recentEvents.length > MAX_EVENTS) recentEvents.length = MAX_EVENTS;
};

const pruneStale = () => {
  const now = Date.now();
  for (const [key, row] of sessions.entries()) {
    if (now - new Date(row.lastSeenAt).getTime() > STALE_MS) {
      sessions.delete(key);
      pushEvent('disconnect', row);
    }
  }
};

const broadcastToAdmins = () => {
  const io = getNotificationIo();
  if (!io) return;
  io.to('role:admin').emit('presence:live', getLiveSnapshot());
};

let broadcastTimer = null;
const scheduleBroadcast = () => {
  if (broadcastTimer) return;
  broadcastTimer = setTimeout(() => {
    broadcastTimer = null;
    pruneStale();
    broadcastToAdmins();
  }, 800);
};

const resolveKey = (payload = {}) =>
  payload.socketId || payload.sessionId || randomUUID();

const upsertSession = (payload = {}) => {
  const key = resolveKey(payload);
  const existing = sessions.get(key);
  const now = new Date().toISOString();
  const row = {
    key,
    socketId: payload.socketId || existing?.socketId || null,
    sessionId: payload.sessionId || existing?.sessionId || key,
    userId: payload.userId ?? existing?.userId ?? null,
    role: payload.role || existing?.role || 'visitor',
    name: payload.name || existing?.name || 'Visiteur',
    region: payload.region || existing?.region || 'Non assignée',
    path: payload.path || existing?.path || '/',
    connectedAt: existing?.connectedAt || now,
    lastSeenAt: now,
  };
  const isNew = !existing;
  sessions.set(key, row);
  if (isNew) pushEvent('connect', row);
  scheduleBroadcast();
  return row;
};

const touchSession = (key, patch = {}) => {
  const row = sessions.get(key);
  if (!row) return null;
  Object.assign(row, patch, { lastSeenAt: new Date().toISOString() });
  sessions.set(key, row);
  scheduleBroadcast();
  return row;
};

const removeSession = (key) => {
  const row = sessions.get(key);
  if (!row) return;
  sessions.delete(key);
  pushEvent('disconnect', row);
  scheduleBroadcast();
};

const removeBySocketId = (socketId) => {
  for (const [key, row] of sessions.entries()) {
    if (row.socketId === socketId) {
      removeSession(key);
      return;
    }
  }
};

const registerFromSocket = (socketId, payload = {}) =>
  upsertSession({ ...payload, socketId, sessionId: payload.sessionId || socketId });

const heartbeatFromSocket = (socketId, patch = {}) => {
  for (const [key, row] of sessions.entries()) {
    if (row.socketId === socketId) {
      return touchSession(key, patch);
    }
  }
  return registerFromSocket(socketId, { ...patch, sessionId: socketId });
};

const registerFromHttp = (payload = {}) => upsertSession(payload);

const getLiveSnapshot = () => {
  pruneStale();
  const active = [...sessions.values()];
  const totals = {};
  ROLES.forEach((r) => { totals[r] = 0; });
  const byRegion = {};

  active.forEach((s) => {
    const role = ROLES.includes(s.role) ? s.role : 'visitor';
    totals[role] = (totals[role] || 0) + 1;
    const region = s.region || 'Non assignée';
    if (!byRegion[region]) {
      byRegion[region] = { region, visitor: 0, client: 0, livreur: 0, vet: 0, moderator: 0, vendor: 0, admin: 0, total: 0 };
    }
    byRegion[region][role] = (byRegion[region][role] || 0) + 1;
    byRegion[region].total += 1;
  });

  const byRole = {};
  ROLES.forEach((role) => {
    byRole[role] = active
      .filter((s) => s.role === role)
      .map((s) => ({
        sessionId: s.sessionId,
        userId: s.userId,
        name: s.name,
        region: s.region || 'Non assignée',
        path: s.path,
        connectedAt: s.connectedAt,
        lastSeenAt: s.lastSeenAt,
      }))
      .sort((a, b) => new Date(b.lastSeenAt) - new Date(a.lastSeenAt));
  });

  return {
    updatedAt: new Date().toISOString(),
    onlineTotal: active.length,
    totals,
    byRegion: Object.values(byRegion).sort((a, b) => b.total - a.total),
    byRole,
    recentEvents: recentEvents.slice(0, 40),
    sessions: active.map((s) => ({
      sessionId: s.sessionId,
      userId: s.userId,
      role: s.role,
      name: s.name,
      region: s.region || 'Non assignée',
      path: s.path,
      connectedAt: s.connectedAt,
      lastSeenAt: s.lastSeenAt,
    })),
  };
};

const getRegisteredByRegion = async () => {
  try {
    const { prisma, isDemoMode } = require('../prismaClient');
    const demoStore = require('../utils/demoStore');
    const citySvc = require('./platformCities.service');

    let users = [];
    if (isDemoMode()) {
      users = demoStore.getUsers() || [];
    } else {
      users = await prisma.user.findMany({
        where: { isActive: true, role: { in: ROLES.filter((r) => r !== 'visitor') } },
        select: { id: true, name: true, email: true, role: true, region: true, createdAt: true },
      });
    }

    const regions = await citySvc.getRegionNames();
    const byRegion = {};
    regions.forEach((r) => {
      byRegion[r] = { region: r, client: 0, livreur: 0, vet: 0, moderator: 0, vendor: 0, admin: 0, total: 0, users: [] };
    });
    byRegion['Non assignée'] = { region: 'Non assignée', client: 0, livreur: 0, vet: 0, moderator: 0, vendor: 0, admin: 0, total: 0, users: [] };

    users.forEach((u) => {
      const region = u.region || 'Non assignée';
      if (!byRegion[region]) {
        byRegion[region] = { region, client: 0, livreur: 0, vet: 0, moderator: 0, vendor: 0, admin: 0, total: 0, users: [] };
      }
      const role = u.role || 'client';
      if (byRegion[region][role] != null) byRegion[region][role] += 1;
      byRegion[region].total += 1;
      byRegion[region].users.push({
        id: u.id || u._id,
        name: u.name,
        email: u.email,
        role,
        region,
        createdAt: u.createdAt,
      });
    });

    return {
      totals: users.reduce((acc, u) => {
        const role = u.role || 'client';
        acc[role] = (acc[role] || 0) + 1;
        acc.all = (acc.all || 0) + 1;
        return acc;
      }, {}),
      byRegion: Object.values(byRegion).sort((a, b) => b.total - a.total),
    };
  } catch (err) {
    return { totals: {}, byRegion: [], error: err.message };
  }
};

const getAdminLivePack = async () => ({
  live: getLiveSnapshot(),
  registered: await getRegisteredByRegion(),
});

setInterval(() => {
  pruneStale();
  broadcastToAdmins();
}, 15_000);

module.exports = {
  ROLES,
  registerFromSocket,
  heartbeatFromSocket,
  removeBySocketId,
  registerFromHttp,
  getLiveSnapshot,
  getRegisteredByRegion,
  getAdminLivePack,
};
