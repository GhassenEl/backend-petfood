const fs = require('fs');
const path = require('path');
const { prisma, isDemoMode } = require('../prismaClient');

const LOG_FILE = path.join(__dirname, '../data/activityLogs.json');
const MAX_LOGS = 5000;
const DEFAULT_LIMIT = 500;

const SEED_LOGS = [
  { actorRole: 'admin', actorName: 'Ghassen Admin', action: 'config_update', target: 'Commission vendeur', details: 'Taux 12 %', module: 'admin' },
  { actorRole: 'admin', actorName: 'Ghassen Admin', action: 'price_policy_update', target: 'Politique tarifaire', details: 'Badge prix vérifié activé', module: 'admin' },
  { actorRole: 'moderator', actorName: 'Nour Modération', action: 'approve_product', target: 'Croquettes chiot premium 8 kg', module: 'moderation' },
  { actorRole: 'vendor', actorName: 'Leila Mansouri', action: 'create_product', target: 'Jouet interactif chat', module: 'vendor' },
  { actorRole: 'client', actorName: 'Sami Ben Ali', action: 'place_order', target: 'CMD-9102', details: '89 DT', module: 'boutique' },
  { actorRole: 'livreur', actorName: 'Karim Mansouri', action: 'delivery_complete', target: 'CMD-9085', module: 'livraison' },
  { actorRole: 'vet', actorName: 'Dr. Amira Khelifi', action: 'appointment_confirm', target: 'RDV Luna', module: 'sante' },
];

const readFileLogs = () => {
  try {
    if (fs.existsSync(LOG_FILE)) {
      const data = JSON.parse(fs.readFileSync(LOG_FILE, 'utf8'));
      return Array.isArray(data) ? data : [];
    }
  } catch {
    /* ignore */
  }
  return [];
};

const writeFileLogs = (logs) => {
  try {
    fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });
    fs.writeFileSync(LOG_FILE, JSON.stringify(logs.slice(0, MAX_LOGS), null, 2));
  } catch {
    /* ignore */
  }
};

const toClientRow = (row) => ({
  id: row.id,
  at: row.at instanceof Date ? row.at.toISOString() : row.at,
  actorRole: row.actorRole,
  actorId: row.actorId || null,
  actorName: row.actorName,
  action: row.action,
  target: row.target || '',
  details: row.details || '',
  module: row.module || 'platform',
});

const applyFilters = (logs, filters = {}) => {
  let list = [...logs];
  if (filters.role && filters.role !== 'all') {
    list = list.filter((l) => l.actorRole === filters.role);
  }
  if (filters.module && filters.module !== 'all') {
    list = list.filter((l) => l.module === filters.module);
  }
  const q = String(filters.search || '').trim().toLowerCase();
  if (q) {
    list = list.filter(
      (l) =>
        l.action?.toLowerCase().includes(q) ||
        l.target?.toLowerCase().includes(q) ||
        l.actorName?.toLowerCase().includes(q) ||
        (l.details || '').toLowerCase().includes(q),
    );
  }
  const limit = Math.min(Number(filters.limit) || DEFAULT_LIMIT, MAX_LOGS);
  const offset = Math.max(Number(filters.offset) || 0, 0);
  return {
    total: list.length,
    logs: list.slice(offset, offset + limit).map(toClientRow),
  };
};

const appendFileLog = (entry) => {
  const logs = readFileLogs();
  const row = {
    id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    at: new Date().toISOString(),
    ...entry,
  };
  logs.unshift(row);
  if (logs.length > MAX_LOGS) logs.length = MAX_LOGS;
  writeFileLogs(logs);
  return row;
};

const seedFileLogsIfEmpty = () => {
  const logs = readFileLogs();
  if (logs.length) return logs;
  const seeded = SEED_LOGS.map((e, i) => ({
    id: `seed-log-${i + 1}`,
    at: new Date(Date.now() - i * 3600000).toISOString(),
    ...e,
  }));
  writeFileLogs(seeded);
  return seeded;
};

const appendLog = async ({
  actorRole = 'system',
  actorId = null,
  actorName = 'Système',
  action,
  target = '',
  details = '',
  module = 'platform',
  ip = null,
  userAgent = null,
} = {}) => {
  if (!action) return null;

  const payload = {
    actorRole,
    actorId,
    actorName,
    action,
    target,
    details,
    module,
    ip,
    userAgent,
  };

  if (isDemoMode()) {
    return appendFileLog(payload);
  }

  try {
    const row = await prisma.activityLog.create({ data: payload });
    return toClientRow(row);
  } catch (err) {
    console.warn('[ActivityLog] DB insert failed, fallback fichier:', err.message);
    return appendFileLog(payload);
  }
};

const listLogs = async (filters = {}) => {
  if (isDemoMode()) {
    seedFileLogsIfEmpty();
    const sorted = readFileLogs().sort((a, b) => new Date(b.at) - new Date(a.at));
    return applyFilters(sorted, filters);
  }

  try {
    const where = {};
    if (filters.role && filters.role !== 'all') where.actorRole = filters.role;
    if (filters.module && filters.module !== 'all') where.module = filters.module;
    if (filters.search) {
      const q = String(filters.search).trim();
      where.OR = [
        { action: { contains: q } },
        { target: { contains: q } },
        { actorName: { contains: q } },
        { details: { contains: q } },
      ];
    }

    const limit = Math.min(Number(filters.limit) || DEFAULT_LIMIT, MAX_LOGS);
    const offset = Math.max(Number(filters.offset) || 0, 0);

    const [total, rows] = await Promise.all([
      prisma.activityLog.count({ where }),
      prisma.activityLog.findMany({
        where,
        orderBy: { at: 'desc' },
        skip: offset,
        take: limit,
      }),
    ]);

    if (total === 0) {
      for (const seed of SEED_LOGS) {
        await appendLog(seed);
      }
      return listLogs(filters);
    }

    return { total, logs: rows.map(toClientRow) };
  } catch (err) {
    console.warn('[ActivityLog] DB list failed, fallback fichier:', err.message);
    seedFileLogsIfEmpty();
    return applyFilters(readFileLogs(), filters);
  }
};

const exportCsv = (logs) => {
  const header = ['date', 'role', 'acteur', 'action', 'cible', 'module', 'details'];
  const rows = logs.map((l) =>
    [
      l.at,
      l.actorRole,
      l.actorName,
      l.action,
      l.target || '',
      l.module || '',
      (l.details || '').replace(/"/g, '""'),
    ]
      .map((c) => `"${c}"`)
      .join(','),
  );
  return [header.join(','), ...rows].join('\n');
};

const exportLogs = async (filters = {}, format = 'json') => {
  const { logs } = await listLogs({ ...filters, limit: MAX_LOGS, offset: 0 });
  if (format === 'csv') {
    return { contentType: 'text/csv; charset=utf-8', body: exportCsv(logs), filename: `petfoodtn-audit-${new Date().toISOString().slice(0, 10)}.csv` };
  }
  return {
    contentType: 'application/json; charset=utf-8',
    body: JSON.stringify({ exportedAt: new Date().toISOString(), count: logs.length, logs }, null, 2),
    filename: `petfoodtn-audit-${new Date().toISOString().slice(0, 10)}.json`,
  };
};

/** Helper pour controllers backend */
const logFromRequest = (req, payload) =>
  appendLog({
    ...payload,
    actorId: payload.actorId || req.user?.id || req.user?._id || null,
    actorName: payload.actorName || req.user?.name || req.user?.email || 'Utilisateur',
    actorRole: payload.actorRole || req.user?.role || 'system',
    ip: req.ip || req.headers['x-forwarded-for'] || null,
    userAgent: String(req.headers['user-agent'] || '').slice(0, 200) || null,
  });

module.exports = {
  appendLog,
  listLogs,
  exportLogs,
  logFromRequest,
  MAX_LOGS,
};
