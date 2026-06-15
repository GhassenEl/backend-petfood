const { computeClassificationMetrics } = require('./nlpClassificationMetrics');
const { NLP_ARCHITECTURES, VALIDATION_CORPUS } = require('./nlpArchitectures');

const benchmarkNlpArchitectures = (corpus = VALIDATION_CORPUS) => {
  const actual = corpus.map((s) => s.label);

  const results = NLP_ARCHITECTURES.map((arch) => {
    const predicted = corpus.map((s) => arch.predict(s.text));
    const metrics = computeClassificationMetrics(actual, predicted);
    return {
      id: arch.id,
      label: arch.label,
      description: arch.description,
      ...metrics,
      score: metrics.f1,
      valid: true,
    };
  });

  const ranked = [...results].sort((a, b) => {
    if (b.f1 !== a.f1) return b.f1 - a.f1;
    if (b.accuracy !== a.accuracy) return b.accuracy - a.accuracy;
    return b.recall - a.recall;
  });

  const winner = ranked[0];
  const benchmark = ranked.map((r, i) => ({
    ...r,
    rank: i + 1,
    recommended: r.id === winner.id,
    selected: false,
  }));

  return {
    winnerId: winner.id,
    winnerLabel: winner.label,
    benchmark,
    validation: {
      samples: corpus.length,
      holdoutRatio: 0,
      primaryMetric: 'f1',
      task: 'classification_sentiment_fr',
      labels: ['positive', 'negative', 'neutral'],
    },
  };
};

module.exports = { benchmarkNlpArchitectures, VALIDATION_CORPUS };
