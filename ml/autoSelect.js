/**
 * Sélection automatique du meilleur modèle par validation sur hold-out.
 */
const { ARCHITECTURES, MODEL_LABELS } = require('./architectures');
const { computeR2, computeMape, computeRmse } = require('./metrics');

const holdoutSize = (n) => {
  if (n < 4) return 1;
  return Math.min(3, Math.max(1, Math.floor(n / 4)));
};

/**
 * Évalue chaque architecture sur train/validation et retourne le classement.
 * @param {number[]} series - valeurs (ex. CA par période)
 */
const benchmarkArchitectures = (series) => {
  const values = series.map((v) => Number(v) || 0);
  const n = values.length;

  if (n < 2) {
    return {
      selectedModel: 'naive_last',
      selectedLabel: MODEL_LABELS.naive_last,
      benchmark: [],
      validationHoldout: 0,
      reason: 'historique_insuffisant',
    };
  }

  const h = holdoutSize(n);
  const train = values.slice(0, n - h);
  const validation = values.slice(n - h);

  const results = ARCHITECTURES.map((arch) => {
    try {
      const state = arch.fit(train);
      const predicted = arch.predict(state, h);
      const mape = computeMape(validation, predicted);
      const rmse = computeRmse(validation, predicted);
      const r2 = computeR2(validation, predicted);
      const score = mape != null ? mape : rmse;
      return {
        id: arch.id,
        label: arch.label,
        mape,
        rmse,
        r2: Number(r2.toFixed(3)),
        score,
        valid: true,
      };
    } catch (err) {
      return {
        id: arch.id,
        label: arch.label,
        mape: null,
        rmse: null,
        r2: null,
        score: Infinity,
        valid: false,
        error: err.message,
      };
    }
  });

  const ranked = [...results]
    .filter((r) => r.valid)
    .sort((a, b) => {
      const sa = a.score ?? Infinity;
      const sb = b.score ?? Infinity;
      if (sa !== sb) return sa - sb;
      return (b.r2 ?? 0) - (a.r2 ?? 0);
    });

  const winner = ranked[0] || results.find((r) => r.id === 'naive_last');
  const benchmark = ranked.map((r, i) => ({
    ...r,
    rank: i + 1,
    selected: r.id === winner.id,
  }));

  return {
    selectedModel: winner.id,
    selectedLabel: winner.label,
    benchmark,
    validationHoldout: h,
    reason: 'holdout_mape',
  };
};

/**
 * Prévision complète : auto-sélection + fit sur toute la série + horizon.
 */
const forecastWithAutoModel = (series, horizonSteps) => {
  const values = series.map((v) => Number(v) || 0);
  const selection = benchmarkArchitectures(values);
  const arch =
    ARCHITECTURES.find((a) => a.id === selection.selectedModel) ||
    ARCHITECTURES.find((a) => a.id === 'naive_last');

  const state = arch.fit(values);
  const predicted = arch.predict(state, horizonSteps);
  const stdRes =
    typeof arch.residualStd === 'function' ? arch.residualStd(values, state) : 0;

  let slopePerMonth = 0;
  let r2 = selection.benchmark.find((b) => b.selected)?.r2 ?? null;
  if (arch.id === 'linear_regression' && state.slope != null) {
    slopePerMonth = Number(state.slope.toFixed(2));
    r2 = state.r2 != null ? Number(state.r2.toFixed(3)) : r2;
  }

  const mapeWinner = selection.benchmark.find((b) => b.selected)?.mape ?? null;

  return {
    model: arch.id,
    modelLabel: arch.label,
    modelBenchmark: selection.benchmark,
    modelSelection: {
      method: selection.reason,
      holdout: selection.validationHoldout,
    },
    predictions: predicted.map((revenue) => ({
      revenue: Number(revenue.toFixed(2)),
      revenueLow: Number(Math.max(0, revenue - stdRes * 1.2).toFixed(2)),
      revenueHigh: Number((revenue + stdRes * 1.2).toFixed(2)),
    })),
    metrics: {
      r2,
      mape: mapeWinner,
      slopePerMonth,
    },
  };
};

module.exports = {
  benchmarkArchitectures,
  forecastWithAutoModel,
  holdoutSize,
};
