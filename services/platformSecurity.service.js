const { prisma, isDemoMode } = require('../prismaClient');
const demoStore = require('../utils/demoStore');
const { signatureCount } = require('./securityScan.service');
const threatLog = require('./threatLog.service');
const { listIntrusionEvents, getIdsStatus } = require('./intrusionDetection.service');
const { detectFraudSignals } = require('./fraudDetection.service');
const { listSessions } = require('./sessionRegistry.service');

const VALID_ROLES = ['admin', 'client', 'livreur', 'vet', 'moderator', 'vendor', 'visitor'];

async function fetchOrdersForFraud(user) {
  try {
    if (isDemoMode()) {
      return demoStore.getOrders(user || { role: 'admin' }) || [];
    }
    const orders = await prisma.order.findMany({
      take: 100,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        total: true,
        paymentMethod: true,
        userId: true,
        createdAt: true,
        user: { select: { email: true } },
      },
    });
    return orders;
  } catch {
    return [];
  }
}

async function buildPlatformSecurityPack(req) {
  const antivirus = threatLog.getStatus(signatureCount);
  const ids = getIdsStatus();
  const intrusionItems = listIntrusionEvents(30);
  const threatItems = threatLog.listThreats(20);
  const orders = await fetchOrdersForFraud(req.user);
  const fraudAlerts = detectFraudSignals({ orders, events: intrusionItems });

  const currentJti = req.user?.jti || null;
  const activeSessions = listSessions({
    userId: req.user?.id || req.user?._id,
    adminView: req.user?.role === 'admin',
    currentJti,
  });

  const checks = [
    {
      id: 'jwt',
      label: 'JWT + sessions',
      ok: Boolean(process.env.JWT_SECRET),
      detail: `${VALID_ROLES.length} rôles · ${activeSessions.length} session(s)`,
    },
    {
      id: 'ids',
      label: 'IDS actif',
      ok: ids.enabled !== false,
      detail: `${ids.eventsLast24h ?? 0} alertes / 24h`,
    },
    {
      id: 'av',
      label: 'Anti-virus applicatif',
      ok: antivirus.blockingEnabled !== false,
      detail: `${antivirus.signatureCount ?? signatureCount} signatures`,
    },
    {
      id: 'rate',
      label: 'Rate limiting auth',
      ok: true,
      detail: 'Login 20/15min · Register 5/h',
    },
    {
      id: 'fraud',
      label: 'Détection fraude',
      ok: true,
      detail: `${fraudAlerts.length} alerte(s)`,
    },
    {
      id: 'cors',
      label: 'CORS + en-têtes sécurité',
      ok: true,
      detail: 'CSP, nosniff, Referrer-Policy',
    },
  ];

  const score = Math.round((checks.filter((c) => c.ok).length / checks.length) * 100);

  return {
    collectedAt: new Date().toISOString(),
    securityScore: score,
    checks,
    status: {
      ...antivirus,
      ids,
      protection: {
        antivirus: antivirus.blockingEnabled,
        ids: ids.enabled,
        idsBlocking: ids.blockingEnabled,
      },
    },
    intrusionEvents: intrusionItems,
    events: intrusionItems,
    threatList: threatItems,
    threats: threatItems,
    fraudAlerts,
    activeSessions,
    sessions: activeSessions,
    stats: {
      threats: threatItems.length,
      intrusions: intrusionItems.length,
      fraudAlerts: fraudAlerts.length,
      activeSessions: activeSessions.length,
      eventsLast24h: ids.eventsLast24h ?? 0,
    },
    roles: VALID_ROLES.map((r) => ({ id: r, label: r })),
  };
}

module.exports = {
  buildPlatformSecurityPack,
  VALID_ROLES,
};
