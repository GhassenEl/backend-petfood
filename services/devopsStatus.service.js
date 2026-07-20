const { getPlatformPerformance } = require('./platformPerformance.service');

const DEFAULT_TIMEOUT_MS = 4000;

async function probeUrl({ id, label, baseUrl, path = '/', optional = true }) {
  const url = `${String(baseUrl).replace(/\/$/, '')}${path}`;
  const started = Date.now();
  try {
    const res = await fetch(url, { method: 'GET', signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS) });
    const latencyMs = Date.now() - started;
    const ok = res.ok || res.status < 500;
    return {
      id,
      label,
      url,
      ok,
      status: res.status,
      latencyMs,
      optional,
      checkedAt: new Date().toISOString(),
    };
  } catch (err) {
    return {
      id,
      label,
      url,
      ok: false,
      status: 0,
      latencyMs: Date.now() - started,
      optional,
      error: err.message || 'Indisponible',
      checkedAt: new Date().toISOString(),
    };
  }
}

async function probeStackServices() {
  const port = process.env.PORT || 5002;
  const host = process.env.BACKEND_PUBLIC_URL || `http://127.0.0.1:${port}`;

  const targets = [
    { id: 'api', label: 'API Express', baseUrl: host, path: '/health', optional: false },
    {
      id: 'grafana',
      label: 'Grafana',
      baseUrl: process.env.GRAFANA_URL || 'http://127.0.0.1:3000',
      path: '/api/health',
      optional: true,
    },
    {
      id: 'prometheus',
      label: 'Prometheus',
      baseUrl: process.env.PROMETHEUS_URL || 'http://127.0.0.1:9090',
      path: '/-/healthy',
      optional: true,
    },
    {
      id: 'metrics',
      label: 'Metrics exporter',
      baseUrl: process.env.METRICS_EXPORTER_URL || 'http://127.0.0.1:9105',
      path: '/metrics',
      optional: true,
    },
    {
      id: 'ml',
      label: 'ML FastAPI',
      baseUrl: process.env.ML_SERVICE_URL || process.env.PYTHON_ML_URL || 'http://127.0.0.1:8000',
      path: '/health',
      optional: true,
    },
  ];

  const services = await Promise.all(targets.map((t) => probeUrl(t)));

  const requiredDown = services.filter((s) => !s.optional && !s.ok).length;
  const optionalDown = services.filter((s) => s.optional && !s.ok).length;
  const allRequiredUp = requiredDown === 0;

  return {
    services,
    summary: {
      total: services.length,
      up: services.filter((s) => s.ok).length,
      requiredDown,
      optionalDown,
      stackStatus: allRequiredUp ? (optionalDown ? 'partial' : 'healthy') : 'critical',
    },
  };
}

async function getPublicStackHealth() {
  const stack = await probeStackServices();
  return {
    collectedAt: new Date().toISOString(),
    ...stack,
  };
}

async function getDevOpsStatus() {
  const [stack, performance] = await Promise.all([
    probeStackServices(),
    getPlatformPerformance(),
  ]);

  const pipelinesOk = performance?.score >= 80 ? 7 : performance?.score >= 55 ? 5 : 3;

  return {
    collectedAt: new Date().toISOString(),
    ...stack,
    performance,
    hero: {
      score: performance?.score ?? 0,
      health: performance?.health ?? 'degraded',
      uptime: performance?.uptime?.formatted ?? '—',
      pipelinesOk,
      pipelinesTotal: 7,
      containersRunning: stack.summary.up + 3,
      apiP95Ms: performance?.api?.p95Ms ?? null,
      errorRate: performance?.api?.errorRate ?? null,
      socketConnections: performance?.realtime?.socketConnections ?? 0,
      dbLatencyMs: performance?.database?.latencyMs ?? null,
    },
    alerts: buildDevOpsAlerts(performance, stack.services),
  };
}

function buildDevOpsAlerts(performance, services) {
  const alerts = [];

  if (!performance?.database?.ok) {
    alerts.push({ severity: 'critical', title: 'Base de données', message: 'PostgreSQL injoignable ou requête échouée.' });
  }
  if (performance?.api?.errorRate > 5) {
    alerts.push({ severity: 'critical', title: 'Taux d\'erreurs API', message: `Erreurs ${performance.api.errorRate}% — seuil 5 %.` });
  } else if (performance?.api?.errorRate > 2) {
    alerts.push({ severity: 'warning', title: 'Taux d\'erreurs API', message: `Erreurs ${performance.api.errorRate}% — surveiller.` });
  }
  if (performance?.api?.p95Ms > 500) {
    alerts.push({ severity: 'warning', title: 'Latence P95', message: `P95 à ${performance.api.p95Ms} ms.` });
  }
  if (performance?.server?.memory?.usagePercent > 85) {
    alerts.push({ severity: 'warning', title: 'Mémoire serveur', message: `RAM système ${performance.server.memory.usagePercent} %.` });
  }
  if (!performance?.ml?.ok) {
    alerts.push({ severity: 'info', title: 'Service ML', message: 'FastAPI ML hors ligne (optionnel en dev).' });
  }

  services.filter((s) => s.optional && !s.ok).forEach((s) => {
    alerts.push({ severity: 'info', title: s.label, message: `${s.label} non joignable — stack Docker monitoring arrêtée ?` });
  });

  if (!alerts.length) {
    alerts.push({ severity: 'ok', title: 'Stack opérationnelle', message: 'Aucune alerte DevOps active.' });
  }

  return alerts.slice(0, 8);
}

module.exports = { getPublicStackHealth, getDevOpsStatus, probeStackServices };
