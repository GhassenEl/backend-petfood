const { benchmarkArchitectures } = require('../ml/autoSelect');
const { ARCHITECTURES, MODEL_LABELS } = require('../ml/architectures');
const { getSalesForecast, aggregateMonthly } = require('./salesForecast.service');
const { prisma, isDemoMode } = require('../prismaClient');
const demoStore = require('../utils/demoStore');

/** Série synthétique avec tendance + saisonnalité légère */
const SYNTHETIC_SERIES = [
  3200, 3800, 4100, 4500, 5200, 4900, 5600, 6100, 5800, 6400, 6900, 7200,
];

const fetchRevenueSeries = async (monthsBack = 12) => {
  const since = new Date();
  since.setMonth(since.getMonth() - monthsBack);
  since.setDate(1);

  let orders;
  if (isDemoMode()) {
    orders = (demoStore.getOrders({ role: 'admin', _id: 'demo_admin' }) || []).filter(
      (o) => new Date(o.createdAt) >= since
    );
  } else {
    orders = await prisma.order.findMany({
      where: {
        createdAt: { gte: since },
        NOT: { status: { in: ['cancelled', 'canceled', 'refunded'] } },
      },
      select: { total: true, createdAt: true },
    });
  }

  const history = aggregateMonthly(orders);
  return history.map((h) => h.revenue);
};

const runMlBenchmark = async ({ monthsBack = 12, useSynthetic = false } = {}) => {
  let series = useSynthetic ? SYNTHETIC_SERIES : await fetchRevenueSeries(monthsBack);
  if (series.length < 4) {
    series = SYNTHETIC_SERIES;
  }

  const result = benchmarkArchitectures(series);

  return {
    generatedAt: new Date().toISOString(),
    dataPoints: series.length,
    seriesPreview: series.slice(-6),
    architectures: ARCHITECTURES.map((a) => ({ id: a.id, label: a.label })),
    modelLabels: MODEL_LABELS,
    ...result,
  };
};

/** Benchmark + dernière prévision admin (cohérence pipeline) */
const runFullMlReport = async (opts = {}) => {
  const benchmark = await runMlBenchmark(opts);
  const forecast = await getSalesForecast({
    monthsBack: opts.monthsBack || 12,
    horizon: opts.horizon || 3,
  });
  return {
    benchmark,
    productionForecast: {
      model: forecast.model,
      modelLabel: forecast.modelLabel,
      modelBenchmark: forecast.modelBenchmark,
      metrics: forecast.metrics,
    },
  };
};

module.exports = { runMlBenchmark, runFullMlReport, SYNTHETIC_SERIES };
