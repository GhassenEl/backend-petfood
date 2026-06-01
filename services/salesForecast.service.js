const { prisma, isDemoMode } = require('../prismaClient');
const demoStore = require('../utils/demoStore');
const { completionWithSystem } = require('./groq.service');

const EXCLUDED_STATUSES = ['cancelled', 'canceled', 'refunded'];

const monthKey = (date) => {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

const monthLabel = (key) => {
  const [y, m] = key.split('-');
  return `${m}/${y}`;
};

const addMonths = (key, n) => {
  const [y, m] = key.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return monthKey(d);
};

const addWeeks = (key, n) => {
  const d = new Date(key);
  d.setDate(d.getDate() + n * 7);
  return weekKey(d);
};

const linearRegression = (points) => {
  const n = points.length;
  if (n === 0) return { intercept: 0, slope: 0, r2: 0 };
  if (n === 1) return { intercept: points[0].y, slope: 0, r2: 1 };

  const sumX = points.reduce((s, p) => s + p.x, 0);
  const sumY = points.reduce((s, p) => s + p.y, 0);
  const sumXY = points.reduce((s, p) => s + p.x * p.y, 0);
  const sumX2 = points.reduce((s, p) => s + p.x * p.x, 0);
  const denom = n * sumX2 - sumX * sumX;
  const slope = denom === 0 ? 0 : (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;

  const meanY = sumY / n;
  const ssTot = points.reduce((s, p) => s + (p.y - meanY) ** 2, 0);
  const ssRes = points.reduce((s, p) => {
    const pred = intercept + slope * p.x;
    return s + (p.y - pred) ** 2;
  }, 0);
  const r2 = ssTot === 0 ? 1 : Math.max(0, 1 - ssRes / ssTot);

  return { intercept, slope, r2 };
};

const computeMape = (points, intercept, slope) => {
  const valid = points.filter((p) => p.y > 0);
  if (!valid.length) return null;
  const mape =
    valid.reduce((s, p) => {
      const pred = Math.max(0, intercept + slope * p.x);
      return s + Math.abs((p.y - pred) / p.y);
    }, 0) / valid.length;
  return Number((mape * 100).toFixed(1));
};

const aggregateMonthly = (orders) => {
  const map = new Map();
  for (const o of orders) {
    const key = monthKey(o.createdAt);
    const prev = map.get(key) || { revenue: 0, orders: 0 };
    prev.revenue += Number(o.total || 0);
    prev.orders += 1;
    map.set(key, prev);
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, v]) => ({
      month: key,
      label: monthLabel(key),
      revenue: Number(v.revenue.toFixed(2)),
      orders: v.orders,
    }));
};

const weekKey = (date) => {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(d.setDate(diff));
  return monday.toISOString().slice(0, 10);
};

const aggregateWeekly = (orders) => {
  const map = new Map();
  for (const o of orders) {
    const key = weekKey(o.createdAt);
    const prev = map.get(key) || { revenue: 0, orders: 0 };
    prev.revenue += Number(o.total || 0);
    prev.orders += 1;
    map.set(key, prev);
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, v]) => ({
      month: key,
      label: `S${key.slice(5)}`,
      revenue: Number(v.revenue.toFixed(2)),
      orders: v.orders,
    }));
};

const fetchOrders = async (monthsBack) => {
  const since = new Date();
  since.setMonth(since.getMonth() - monthsBack);
  since.setDate(1);
  since.setHours(0, 0, 0, 0);

  if (isDemoMode()) {
    const orders = demoStore.getOrders({ role: 'admin', _id: 'demo_admin' }) || [];
    return orders.filter((o) => {
      const d = new Date(o.createdAt);
      return d >= since && !EXCLUDED_STATUSES.includes(String(o.status || '').toLowerCase());
    });
  }

  return prisma.order.findMany({
    where: {
      createdAt: { gte: since },
      NOT: { status: { in: EXCLUDED_STATUSES } },
    },
    select: { id: true, total: true, createdAt: true, status: true },
    orderBy: { createdAt: 'asc' },
  });
};

const buildForecast = (history, horizon, granularity = 'monthly') => {
  const points = history.map((h, i) => ({ x: i, y: h.revenue }));
  const { intercept, slope, r2 } = linearRegression(points);
  const mape = computeMape(points, intercept, slope);
  const stdRes = (() => {
    if (points.length < 2) return 0;
    const residuals = points.map((p) => p.y - (intercept + slope * p.x));
    const mean = residuals.reduce((a, b) => a + b, 0) / residuals.length;
    const variance = residuals.reduce((s, r) => s + (r - mean) ** 2, 0) / residuals.length;
    return Math.sqrt(variance);
  })();

  const lastKey = history.length ? history[history.length - 1].month : monthKey(new Date());
  const periodsAhead = granularity === 'weekly' ? horizon * 4 : horizon;
  const forecast = [];

  for (let i = 1; i <= periodsAhead; i += 1) {
    const x = history.length - 1 + i;
    const predicted = Math.max(0, intercept + slope * x);
    const periodKey =
      granularity === 'weekly' ? addWeeks(lastKey, i) : addMonths(lastKey, i);
    const periodLabel =
      granularity === 'weekly'
        ? `Sem. ${periodKey.slice(5)}`
        : monthLabel(periodKey);

    forecast.push({
      month: periodKey,
      label: periodLabel,
      revenue: Number(predicted.toFixed(2)),
      revenueLow: Number(Math.max(0, predicted - stdRes * 1.2).toFixed(2)),
      revenueHigh: Number((predicted + stdRes * 1.2).toFixed(2)),
      orders: history.length
        ? Math.max(0, Math.round(history.reduce((s, h) => s + h.orders, 0) / history.length))
        : 0,
      type: 'forecast',
    });
  }

  const trend = slope > (granularity === 'weekly' ? 15 : 50) ? 'up' : slope < (granularity === 'weekly' ? -15 : -50) ? 'down' : 'stable';

  const totalHistorical = history.reduce((s, h) => s + h.revenue, 0);
  const totalForecast = forecast.reduce((s, f) => s + f.revenue, 0);

  return {
    model: 'linear_regression',
    metrics: {
      r2: Number(r2.toFixed(3)),
      mape,
      trend,
      slopePerMonth: Number(slope.toFixed(2)),
    },
    history: history.map((h) => ({ ...h, type: 'actual' })),
    forecast,
    summary: {
      totalHistoricalRevenue: Number(totalHistorical.toFixed(2)),
      totalForecastRevenue: Number(totalForecast.toFixed(2)),
      avgMonthlyHistorical:
        history.length > 0
          ? Number((totalHistorical / history.length).toFixed(2))
          : 0,
      avgMonthlyForecast:
        forecast.length > 0
          ? Number((totalForecast / forecast.length).toFixed(2))
          : 0,
    },
  };
};

const buildDemoFallbackHistory = () => {
  const now = new Date();
  const history = [];
  for (let i = 11; i >= 0; i -= 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const base = 4200 + i * 180 + Math.sin(i * 0.8) * 400;
    history.push({
      month: monthKey(d),
      label: monthLabel(monthKey(d)),
      revenue: Number(base.toFixed(2)),
      orders: Math.round(8 + i * 0.6 + Math.random() * 3),
    });
  }
  return history;
};

const buildAiSummary = async (payload) => {
  const system = `Tu es un analyste e-commerce PetfoodTN. Résume la prévision de ventes en 2-3 phrases en français, ton professionnel et actionnable.`;
  const user = JSON.stringify(payload, null, 2);
  const text = await completionWithSystem(system, user, { max_tokens: 280 });
  return text || null;
};

const getSalesForecast = async ({ monthsBack = 12, horizon = 3 } = {}) => {
  const months = Math.min(Math.max(Number(monthsBack) || 12, 3), 24);
  const horizonMonths = Math.min(Math.max(Number(horizon) || 3, 1), 6);

  let orders = await fetchOrders(months);
  let history = aggregateMonthly(orders);
  let granularity = 'monthly';

  if (history.length < 2) {
    const weekly = aggregateWeekly(orders);
    if (weekly.length >= 3) {
      history = weekly;
      granularity = 'weekly';
    }
  }

  if (history.length < 2 && isDemoMode()) {
    history = buildDemoFallbackHistory();
  }

  if (history.length < 2) {
    const avgRev =
      history.length === 1
        ? history[0].revenue
        : orders.reduce((s, o) => s + Number(o.total || 0), 0) /
            Math.max(1, orders.length);

    const padded = history.length
      ? history
      : [
          {
            month: monthKey(new Date()),
            label: monthLabel(monthKey(new Date())),
            revenue: Number(avgRev.toFixed(2)) || 1000,
            orders: orders.length || 1,
          },
        ];

    const lastKey = padded[padded.length - 1].month;
    const forecast = Array.from({ length: horizonMonths }, (_, i) => ({
      month: addMonths(lastKey, i + 1),
      label: monthLabel(addMonths(lastKey, i + 1)),
      revenue: Number((padded[padded.length - 1].revenue || 1000).toFixed(2)),
      revenueLow: Number(((padded[padded.length - 1].revenue || 1000) * 0.85).toFixed(2)),
      revenueHigh: Number(((padded[padded.length - 1].revenue || 1000) * 1.15).toFixed(2)),
      orders: padded[padded.length - 1].orders || 1,
      type: 'forecast',
    }));

    return {
      model: 'naive_average',
      metrics: { r2: null, mape: null, trend: 'stable', slopePerMonth: 0 },
      history: padded.map((h) => ({ ...h, type: 'actual' })),
      forecast,
      summary: {
        totalHistoricalRevenue: padded.reduce((s, h) => s + h.revenue, 0),
        totalForecastRevenue: forecast.reduce((s, f) => s + f.revenue, 0),
        avgMonthlyHistorical: padded[padded.length - 1].revenue,
        avgMonthlyForecast: forecast[0]?.revenue || 0,
      },
      insight:
        'Historique insuffisant pour une régression fiable — prévision basée sur la moyenne récente.',
      aiPowered: false,
      periodMonths: months,
      horizonMonths,
    };
  }

  const result = buildForecast(history, horizonMonths, granularity);
  let insight = null;
  let aiPowered = false;

  try {
    insight = await buildAiSummary({
      metrics: result.metrics,
      summary: result.summary,
      lastMonth: history[history.length - 1],
      forecast: result.forecast,
      granularity,
    });
    if (insight) aiPowered = true;
  } catch {
    insight = null;
  }

  if (!insight) {
    const { trend, slopePerMonth } = result.metrics;
    const unit = granularity === 'weekly' ? 'semaine' : 'mois';
    const dir =
      trend === 'up'
        ? `tendance haussière (+${slopePerMonth} DT/${unit})`
        : trend === 'down'
          ? `tendance baissière (${slopePerMonth} DT/${unit})`
          : 'activité stable';
    insight = `Sur ${history.length} périodes d'historique (${granularity === 'weekly' ? 'hebdomadaire' : 'mensuel'}), le CA prévisionnel sur ${horizonMonths} mois est de ${result.summary.totalForecastRevenue.toLocaleString('fr-FR')} DT (${dir}).`;
  }

  return {
    ...result,
    insight,
    aiPowered,
    granularity,
    periodMonths: months,
    horizonMonths,
  };
};

module.exports = { getSalesForecast, aggregateMonthly, linearRegression };
