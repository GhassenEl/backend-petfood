/** Métriques classification multi-classes (sentiment / intent NLP). */

const LABELS = ['positive', 'negative', 'neutral'];

const computeClassificationMetrics = (actual, predicted) => {
  const n = actual.length;
  if (!n) {
    return { accuracy: 0, precision: 0, recall: 0, f1: 0, support: 0 };
  }

  let correct = 0;
  for (let i = 0; i < n; i += 1) {
    if (actual[i] === predicted[i]) correct += 1;
  }
  const accuracy = correct / n;

  let tpSum = 0;
  let fpSum = 0;
  let fnSum = 0;

  LABELS.forEach((label) => {
    let tp = 0;
    let fp = 0;
    let fn = 0;
    for (let i = 0; i < n; i += 1) {
      const a = actual[i];
      const p = predicted[i];
      if (a === label && p === label) tp += 1;
      if (a !== label && p === label) fp += 1;
      if (a === label && p !== label) fn += 1;
    }
    const prec = tp + fp > 0 ? tp / (tp + fp) : 0;
    const rec = tp + fn > 0 ? tp / (tp + fn) : 0;
    const f1 = prec + rec > 0 ? (2 * prec * rec) / (prec + rec) : 0;
    tpSum += tp;
    fpSum += fp;
    fnSum += fn;
  });

  const precision = tpSum + fpSum > 0 ? tpSum / (tpSum + fpSum) : 0;
  const recall = tpSum + fnSum > 0 ? tpSum / (tpSum + fnSum) : 0;
  const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;

  const round3 = (v) => Number(v.toFixed(3));
  return {
    accuracy: round3(accuracy),
    precision: round3(precision),
    recall: round3(recall),
    f1: round3(f1),
    support: n,
  };
};

module.exports = { LABELS, computeClassificationMetrics };
