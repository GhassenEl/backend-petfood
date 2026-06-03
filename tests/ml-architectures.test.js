const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { benchmarkArchitectures, forecastWithAutoModel, holdoutSize } = require('../ml/autoSelect');
const { ARCHITECTURES } = require('../ml/architectures');
const { computeMape, computeR2 } = require('../ml/metrics');
const { linearRegression } = require('../ml/regression');

const TREND_SERIES = [1000, 1200, 1400, 1600, 1800, 2000, 2200, 2400];

describe('ML métriques', () => {
  it('MAPE parfait → 0', () => {
    const actual = [10, 20, 30];
    assert.equal(computeMape(actual, actual), 0);
  });

  it('R² sur prédiction exacte → 1', () => {
    const actual = [5, 10, 15];
    assert.equal(computeR2(actual, actual), 1);
  });
});

describe('ML architectures', () => {
  it('toutes les architectures produisent des prévisions', () => {
    for (const arch of ARCHITECTURES) {
      const state = arch.fit(TREND_SERIES);
      const preds = arch.predict(state, 3);
      assert.equal(preds.length, 3);
      preds.forEach((p) => assert.ok(p >= 0, `${arch.id} doit être ≥ 0`));
    }
  });

  it('régression linéaire détecte une pente positive', () => {
    const pts = TREND_SERIES.map((y, x) => ({ x, y }));
    const { slope } = linearRegression(pts);
    assert.ok(slope > 0);
  });
});

describe('Sélection automatique', () => {
  it('choisit un modèle sur série tendancielle', () => {
    const result = benchmarkArchitectures(TREND_SERIES);
    assert.ok(result.selectedModel);
    assert.ok(result.benchmark.length >= 1);
    assert.equal(result.benchmark[0].rank, 1);
    assert.equal(result.benchmark[0].selected, true);
  });

  it('holdout adaptatif', () => {
    assert.equal(holdoutSize(8), 2);
    assert.equal(holdoutSize(20), 3);
  });

  it('forecastWithAutoModel retourne horizon correct', () => {
    const out = forecastWithAutoModel(TREND_SERIES, 4);
    assert.equal(out.predictions.length, 4);
    assert.ok(out.model);
    assert.ok(Array.isArray(out.modelBenchmark));
  });
});
