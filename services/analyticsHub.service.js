const { prisma, isDemoMode } = require('../prismaClient');
const { getIncidentAgentPack } = require('./incidentMlAgent.service');
const { getPlatformInsights } = require('./mlPlatform.service');
const { checkPythonMlHealth } = require('./mlPythonClient');

const getPharmacyStockAlerts = async () => {
  if (isDemoMode()) {
    return [
      { id: 'demo1', name: 'Carprofène', stockQty: 3, minStock: 5, unit: 'comprimé', severity: 'medium' },
    ];
  }
  const meds = await prisma.vetMedication.findMany({
    orderBy: { stockQty: 'asc' },
    take: 100,
  });
  return meds
    .filter((m) => m.stockQty <= m.minStock)
    .map((m) => ({
      id: m.id,
      name: m.name,
      stockQty: m.stockQty,
      minStock: m.minStock,
      unit: m.unit,
      severity: m.stockQty === 0 ? 'high' : 'medium',
      link: '/vet/pharmacy',
    }));
};

const getPlatformAlerts = async () => {
  const alerts = [];

  try {
    const incidentPack = await getIncidentAgentPack();
    (incidentPack.queue || [])
      .filter((c) => ['urgent', 'high'].includes(c.aiPriority))
      .slice(0, 8)
      .forEach((c) => {
        alerts.push({
          id: `inc-${c.id}`,
          type: 'incident',
          severity: c.aiPriority === 'urgent' ? 'high' : 'medium',
          title: `Incident IA : ${c.subject}`,
          message: `Priorité ${c.aiPriority} — validation requise`,
          link: '/admin/incidents-ml',
          createdAt: c.createdAt,
        });
      });
    if (incidentPack.platformStats?.awaitingValidation > 0) {
      alerts.push({
        id: 'inc-summary',
        type: 'incident',
        severity: 'medium',
        title: `${incidentPack.platformStats.awaitingValidation} incident(s) IA en attente`,
        message: incidentPack.summary,
        link: '/admin/incidents-ml',
      });
    }
  } catch {
    /* optional */
  }

  const pharmacyAlerts = await getPharmacyStockAlerts();
  pharmacyAlerts.slice(0, 6).forEach((m) => {
    alerts.push({
      id: `rx-${m.id}`,
      type: 'pharmacy',
      severity: m.severity,
      title: `Stock pharmacie : ${m.name}`,
      message: `${m.stockQty} ${m.unit || 'u.'} (min ${m.minStock})`,
      link: '/admin/incidents-ml',
    });
  });

  if (!isDemoMode()) {
    const [pendingComplaints, pendingOrders] = await Promise.all([
      prisma.complaint.count({ where: { status: { in: ['pending', 'ai_proposed'] } } }),
      prisma.order.count({ where: { status: { in: ['pending', 'processing', 'paid'] } } }),
    ]);
    if (pendingComplaints > 5) {
      alerts.push({
        id: 'complaints-backlog',
        type: 'complaint',
        severity: 'medium',
        title: `${pendingComplaints} réclamations en file`,
        message: 'File de modération à traiter',
        link: '/admin/complaints',
      });
    }
    if (pendingOrders > 10) {
      alerts.push({
        id: 'orders-pending',
        type: 'orders',
        severity: 'low',
        title: `${pendingOrders} commandes en attente`,
        message: 'Suivi logistique recommandé',
        link: '/admin/orders',
      });
    }
  }

  try {
    const insights = await getPlatformInsights();
    const anomalies = [
      ...(insights.anomalyDetection?.fraudAlerts || []),
      ...(insights.anomalyDetection?.volumeSpikes || []),
    ];
    anomalies.slice(0, 3).forEach((a, i) => {
      alerts.push({
        id: `anomaly-${i}`,
        type: 'ml',
        severity: 'medium',
        title: 'Anomalie détectée (ML)',
        message: typeof a === 'string' ? a : a.description || a.type || JSON.stringify(a).slice(0, 80),
        link: '/admin/ml-agent',
      });
    });
  } catch {
    /* optional */
  }

  const severityOrder = { high: 0, medium: 1, low: 2 };
  alerts.sort((a, b) => (severityOrder[a.severity] ?? 9) - (severityOrder[b.severity] ?? 9));

  return {
    alerts,
    counts: {
      total: alerts.length,
      high: alerts.filter((a) => a.severity === 'high').length,
      pharmacy: alerts.filter((a) => a.type === 'pharmacy').length,
      incident: alerts.filter((a) => a.type === 'incident').length,
    },
  };
};

const getPowerBiEmbedConfig = () => {
  const embedUrl = process.env.POWER_BI_EMBED_URL || '';
  const reportId = process.env.POWER_BI_REPORT_ID || '';
  return {
    enabled: Boolean(embedUrl),
    embedUrl: embedUrl || null,
    reportId: reportId || null,
    workspaceHint: process.env.POWER_BI_WORKSPACE || 'PetfoodTN',
    setupSteps: [
      'Créer un workspace Power BI et publier le rapport .pbix',
      'Activer Power BI Embedded (Azure) ou utiliser « Publier sur le web » (test uniquement)',
      'Copier l’URL d’intégration dans backend/.env : POWER_BI_EMBED_URL=...',
      'Utiliser les exports /api/analytics/export/* pour actualiser les données',
    ],
  };
};

const getAnalyticsHub = async () => {
  const [alerts, powerBi, mlHealth, insights] = await Promise.all([
    getPlatformAlerts(),
    Promise.resolve(getPowerBiEmbedConfig()),
    checkPythonMlHealth().catch(() => ({ ok: false })),
    getPlatformInsights().catch(() => ({})),
  ]);

  return {
    role: 'admin',
    hub: 'power_bi_analytics',
    powerBi,
    alerts: alerts.alerts,
    alertCounts: alerts.counts,
    mlServiceOk: Boolean(mlHealth?.ok),
    kpis: {
      forecastRevenue: insights.nextMonthRevenue?.forecastRevenue ?? null,
      pendingIncidents: alerts.counts.incident,
      pharmacyAlerts: alerts.counts.pharmacy,
    },
    quickLinks: [
      { label: 'Exports Power BI', path: '/admin/powerbi#exports' },
      { label: 'Valider incidents IA', path: '/admin/incidents-ml' },
      { label: 'Réclamations', path: '/admin/complaints' },
      { label: 'Agent ML admin', path: '/admin/ml-agent' },
    ],
  };
};

module.exports = {
  getAnalyticsHub,
  getPlatformAlerts,
  getPowerBiEmbedConfig,
  getPharmacyStockAlerts,
};
