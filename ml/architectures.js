/**
 * Architectures ML légères (séries temporelles) — sans dépendance Python.
 * Chaque modèle expose : id, label, fit(series), predict(steps), forecast(series, steps).
 */

const { linearRegression: ols } = require('./regression');

const clampNonNegative = (v) => Math.max(0, Number(v) || 0);

const toPoints = (series) => series.map((y, x) => ({ x, y: Number(y) || 0 }));

/** Régression linéaire sur l'indice temporel */
const linearRegression = {
  id: 'linear_regression',
  label: 'Régression linéaire',
  fit(series) {
    const pts = toPoints(series);
    const { intercept, slope, r2 } = ols(pts);
    return { intercept, slope, r2, trainLen: series.length };
  },
  predict(state, steps) {
    const start = state.trainLen;
    return Array.from({ length: steps }, (_, i) =>
      clampNonNegative(state.intercept + state.slope * (start + i))
    );
  },
  residualStd(series, state) {
    const pts = toPoints(series);
    if (pts.length < 2) return 0;
    const residuals = pts.map((p) => p.y - (state.intercept + state.slope * p.x));
    const m = residuals.reduce((a, b) => a + b, 0) / residuals.length;
    const variance = residuals.reduce((s, r) => s + (r - m) ** 2, 0) / residuals.length;
    return Math.sqrt(variance);
  },
};

/** Moyenne mobile (fenêtre adaptative) */
const movingAverage = {
  id: 'moving_average',
  label: 'Moyenne mobile',
  fit(series) {
    const window = Math.min(4, Math.max(2, Math.floor(series.length / 2)));
    return { window, lastValues: series.slice(-window) };
  },
  predict(state, steps) {
    const out = [];
    let buf = [...state.lastValues];
    for (let i = 0; i < steps; i += 1) {
      const avg = buf.reduce((a, b) => a + b, 0) / buf.length;
      const v = clampNonNegative(avg);
      out.push(v);
      buf = [...buf.slice(1), v];
    }
    return out;
  },
  residualStd() {
    return 0;
  },
};

/** Lissage exponentiel simple */
const exponentialSmoothing = {
  id: 'exponential_smoothing',
  label: 'Lissage exponentiel',
  fit(series, options = {}) {
    const alpha = options.alpha ?? 0.35;
    let level = series[0] ?? 0;
    for (let i = 1; i < series.length; i += 1) {
      level = alpha * series[i] + (1 - alpha) * level;
    }
    return { alpha, level };
  },
  predict(state, steps) {
    return Array.from({ length: steps }, () => clampNonNegative(state.level));
  },
  residualStd(series, state) {
    const alpha = state.alpha;
    let level = series[0] ?? 0;
    const residuals = [];
    for (let i = 1; i < series.length; i += 1) {
      const pred = level;
      residuals.push(series[i] - pred);
      level = alpha * series[i] + (1 - alpha) * level;
    }
    if (!residuals.length) return 0;
    const m = residuals.reduce((a, b) => a + b, 0) / residuals.length;
    const variance = residuals.reduce((s, r) => s + (r - m) ** 2, 0) / residuals.length;
    return Math.sqrt(variance);
  },
};

/** Holt (niveau + tendance) — tendance locale */
const holtLinearTrend = {
  id: 'holt_linear_trend',
  label: 'Holt (tendance linéaire)',
  fit(series) {
    const alpha = 0.4;
    const beta = 0.2;
    let level = series[0] ?? 0;
    let trend = series.length > 1 ? series[1] - series[0] : 0;
    for (let i = 1; i < series.length; i += 1) {
      const y = series[i];
      const prevLevel = level;
      level = alpha * y + (1 - alpha) * (level + trend);
      trend = beta * (level - prevLevel) + (1 - beta) * trend;
    }
    return { alpha, beta, level, trend };
  },
  predict(state, steps) {
    return Array.from({ length: steps }, (_, i) =>
      clampNonNegative(state.level + state.trend * (i + 1))
    );
  },
  residualStd() {
    return 0;
  },
};

/** Dernière valeur observée (naïf) */
const naiveLast = {
  id: 'naive_last',
  label: 'Naïf (dernière valeur)',
  fit(series) {
    return { last: series[series.length - 1] ?? 0 };
  },
  predict(state, steps) {
    return Array.from({ length: steps }, () => clampNonNegative(state.last));
  },
  residualStd() {
    return 0;
  },
};

const ARCHITECTURES = [
  linearRegression,
  movingAverage,
  exponentialSmoothing,
  holtLinearTrend,
  naiveLast,
];

const getArchitecture = (id) => ARCHITECTURES.find((a) => a.id === id);

const MODEL_LABELS = Object.fromEntries(
  ARCHITECTURES.map((a) => [a.id, a.label])
);

MODEL_LABELS.naive_average = 'Moyenne récente (fallback)';

module.exports = {
  ARCHITECTURES,
  getArchitecture,
  MODEL_LABELS,
  linearRegression,
  movingAverage,
  exponentialSmoothing,
  holtLinearTrend,
  naiveLast,
};
