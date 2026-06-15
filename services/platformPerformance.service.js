const os = require('os');
const { prisma, isDemoMode } = require('../prismaClient');
const { getPlatformLiveSnapshot } = require('./platformLive.service');
const { getIdsStatus } = require('./intrusionDetection.service');
const { checkPythonMlHealth } = require('./mlPythonClient');
const { getRequestMetrics } = require('../utils/requestMetrics');

let ioInstance = null;

const setPerformanceIo = (io) => {
  ioInstance = io;
};

const getSocketCount = () => {
  try {
    if (!ioInstance) return 0;
    return ioInstance.engine?.clientsCount ?? ioInstance.sockets?.sockets?.size ?? 0;
  } catch {
    return 0;
  }
};

const getDatabaseHealth = async () => {
  if (isDemoMode()) {
    return { ok: true, mode: 'demo', latencyMs: 2 };
  }
  const t0 = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { ok: true, mode: 'live', latencyMs: Date.now() - t0 };
  } catch (err) {
    return { ok: false, mode: 'live', latencyMs: Date.now() - t0, error: err.message };
  }
};

const getEntityCounts = async () => {
  if (isDemoMode()) {
    return {
      users: 142,
      orders: 318,
      products: 86,
      complaints: 12,
      activeUsers24h: 38,
    };
  }
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [users, orders, products, complaints, activeUsers24h] = await Promise.all([
    prisma.user.count(),
    prisma.order.count(),
    prisma.product.count(),
    prisma.complaint.count({ where: { status: { not: 'resolved' } } }),
    prisma.order.groupBy({
      by: ['userId'],
      where: { createdAt: { gte: since } },
    }).then((g) => g.length).catch(() => 0),
  ]);
  return { users, orders, products, complaints, activeUsers24h };
};

const demoPerformance = () => {
  const t = Date.now();
  return {
    collectedAt: new Date().toISOString(),
    mode: 'demo',
    health: 'healthy',
    uptime: {
      seconds: Math.floor(process.uptime()),
      formatted: formatUptime(process.uptime()),
      startedAt: new Date(Date.now() - process.uptime() * 1000).toISOString(),
    },
    server: {
      nodeVersion: process.version,
      platform: os.platform(),
      cpus: os.cpus().length,
      loadAvg: os.loadavg().map((n) => Math.round(n * 100) / 100),
      memory: {
        heapUsedMb: 128,
        heapTotalMb: 192,
        rssMb: 210,
        systemFreeMb: Math.round(os.freemem() / 1024 / 1024),
        systemTotalMb: Math.round(os.totalmem() / 1024 / 1024),
        usagePercent: 42,
      },
    },
    api: {
      totalRequests: 1842 + (Math.floor(t / 60000) % 20),
      avgMs: 48,
      p95Ms: 124,
      errorRate: 0.8,
      requestsLast5m: 34,
      requestSeries: [
        { label: '09:00', count: 28 },
        { label: '09:05', count: 31 },
        { label: '09:10', count: 36 },
        { label: '09:15', count: 34 },
        { label: '09:20', count: 42 },
      ],
      latencySeries: [
        { label: '1', ms: 42 },
        { label: '2', ms: 55 },
        { label: '3', ms: 38 },
        { label: '4', ms: 61 },
        { label: '5', ms: 47 },
      ],
      slowest: [
        { method: 'GET', path: '/api/analytics/hub', status: 200, ms: 186 },
        { method: 'GET', path: '/api/orders', status: 200, ms: 142 },
      ],
    },
    database: { ok: true, mode: 'demo', latencyMs: 3 },
    realtime: {
      socketConnections: 6,
      ordersToday: 8,
      pendingOrders: 3,
      activeDeliveries: 2,
      lowStockProducts: 4,
      pendingComplaints: 2,
    },
    security: {
      idsEnabled: true,
      eventsLast24h: 4,
      bySeverity: { medium: 2, low: 2 },
      monitoredIps: 12,
    },
    ml: { ok: true, service: 'python_ml' },
    entities: {
      users: 142,
      orders: 318,
      products: 86,
      complaints: 12,
      activeUsers24h: 38,
    },
    score: 92,
  };
};

const formatUptime = (seconds) => {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}j ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
};

const computeHealthScore = ({ database, api, security, ml, memory }) => {
  let score = 100;
  if (!database?.ok) score -= 35;
  if (api?.errorRate > 5) score -= 20;
  else if (api?.errorRate > 2) score -= 10;
  if (api?.p95Ms > 500) score -= 15;
  else if (api?.p95Ms > 200) score -= 8;
  if (security?.eventsLast24h > 20) score -= 10;
  if (!ml?.ok) score -= 5;
  if (memory?.usagePercent > 90) score -= 15;
  else if (memory?.usagePercent > 75) score -= 5;
  return Math.max(0, Math.min(100, score));
};

const getPlatformPerformance = async () => {
  if (isDemoMode()) return demoPerformance();

  const mem = process.memoryUsage();
  const heapUsedMb = Math.round(mem.heapUsed / 1024 / 1024);
  const heapTotalMb = Math.round(mem.heapTotal / 1024 / 1024);
  const rssMb = Math.round(mem.rss / 1024 / 1024);
  const systemFreeMb = Math.round(os.freemem() / 1024 / 1024);
  const systemTotalMb = Math.round(os.totalmem() / 1024 / 1024);
  const usagePercent = Math.round((1 - os.freemem() / os.totalmem()) * 100);

  const [database, live, entities, mlHealth] = await Promise.all([
    getDatabaseHealth(),
    getPlatformLiveSnapshot(),
    getEntityCounts(),
    checkPythonMlHealth().catch(() => ({ ok: false })),
  ]);

  const api = getRequestMetrics();
  const security = getIdsStatus();
  const socketConnections = getSocketCount();

  const memory = { heapUsedMb, heapTotalMb, rssMb, systemFreeMb, systemTotalMb, usagePercent };

  const score = computeHealthScore({
    database,
    api,
    security,
    ml: mlHealth,
    memory,
  });

  const health = score >= 80 ? 'healthy' : score >= 55 ? 'degraded' : 'critical';

  return {
    collectedAt: new Date().toISOString(),
    mode: 'live',
    health,
    score,
    uptime: {
      seconds: Math.floor(process.uptime()),
      formatted: formatUptime(process.uptime()),
      startedAt: new Date(Date.now() - process.uptime() * 1000).toISOString(),
    },
    server: {
      nodeVersion: process.version,
      platform: os.platform(),
      cpus: os.cpus().length,
      loadAvg: os.loadavg().map((n) => Math.round(n * 100) / 100),
      memory,
    },
    api,
    database,
    realtime: {
      socketConnections,
      ordersToday: live.ordersToday,
      pendingOrders: live.pendingOrders,
      activeDeliveries: live.activeDeliveries,
      lowStockProducts: live.lowStockProducts,
      pendingComplaints: live.pendingComplaints,
    },
    security: {
      idsEnabled: security.enabled,
      eventsLast24h: security.eventsLast24h,
      bySeverity: security.bySeverity,
      monitoredIps: security.monitoredIps,
    },
    ml: { ok: Boolean(mlHealth?.ok), service: 'python_ml' },
    entities,
  };
};

module.exports = { getPlatformPerformance, setPerformanceIo };
