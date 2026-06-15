const MAX_RECENT = 200;
const startedAt = Date.now();

const stats = {
  total: 0,
  errors4xx: 0,
  errors5xx: 0,
  sumMs: 0,
  recent: [],
};

const recordRequest = ({ method, path, status, ms }) => {
  stats.total += 1;
  if (status >= 500) stats.errors5xx += 1;
  else if (status >= 400) stats.errors4xx += 1;
  stats.sumMs += ms;

  stats.recent.unshift({
    method,
    path: String(path || '').slice(0, 120),
    status,
    ms: Math.round(ms),
    at: new Date().toISOString(),
  });
  if (stats.recent.length > MAX_RECENT) stats.recent.length = MAX_RECENT;
};

const getRequestMetrics = () => {
  const recent = stats.recent;
  const latencies = recent.map((r) => r.ms).sort((a, b) => a - b);
  const avgMs = stats.total ? Math.round(stats.sumMs / stats.total) : 0;
  const p95Ms = latencies.length
    ? latencies[Math.min(latencies.length - 1, Math.floor(latencies.length * 0.95))]
    : 0;

  const last5m = Date.now() - 5 * 60 * 1000;
  const last5mRequests = recent.filter((r) => new Date(r.at).getTime() >= last5m);

  const byMinute = new Map();
  recent.forEach((r) => {
    const key = r.at.slice(0, 16);
    byMinute.set(key, (byMinute.get(key) || 0) + 1);
  });

  const requestSeries = [...byMinute.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-12)
    .map(([bucket, count]) => ({
      label: bucket.slice(11, 16),
      count,
    }));

  const latencySeries = recent
    .slice(0, 20)
    .reverse()
    .map((r, i) => ({
      label: `${i + 1}`,
      ms: r.ms,
      path: r.path,
    }));

  return {
    total: stats.total,
    errors4xx: stats.errors4xx,
    errors5xx: stats.errors5xx,
    errorRate: stats.total
      ? Math.round(((stats.errors4xx + stats.errors5xx) / stats.total) * 1000) / 10
      : 0,
    avgMs,
    p95Ms,
    requestsLast5m: last5mRequests.length,
    requestSeries,
    latencySeries,
    slowest: [...recent].sort((a, b) => b.ms - a.ms).slice(0, 5),
    startedAt: new Date(startedAt).toISOString(),
  };
};

module.exports = { recordRequest, getRequestMetrics };
