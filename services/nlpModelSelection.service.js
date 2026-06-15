const { benchmarkNlpArchitectures } = require('../ml/nlpBenchmark');
const { NLP_ARCHITECTURES } = require('../ml/nlpArchitectures');
const { getConfig, saveConfig, MODEL_LABELS } = require('../utils/nlpModelConfig');

const applySelectionFlags = (benchmark, activeId) =>
  benchmark.map((row) => ({
    ...row,
    selected: row.id === activeId,
  }));

const resolveActiveModelId = (benchmark, mode, manualId) => {
  if (mode === 'manual' && manualId && benchmark.some((b) => b.id === manualId)) {
    return manualId;
  }
  const recommended = benchmark.find((b) => b.recommended) || benchmark[0];
  return recommended?.id || 'bert';
};

const getNlpModelBenchmark = async () => {
  const { benchmark, validation, winnerId, winnerLabel } = benchmarkNlpArchitectures();
  const config = getConfig();
  const activeId = resolveActiveModelId(benchmark, config.selectionMode, config.activeModelId);

  return {
    task: config.task,
    validation,
    benchmark: applySelectionFlags(benchmark, activeId),
    activeModel: {
      id: activeId,
      label: MODEL_LABELS[activeId] || winnerLabel,
      selectionMode: config.selectionMode,
      updatedAt: config.updatedAt,
      updatedBy: config.updatedBy,
    },
    recommendedModelId: winnerId,
    insight:
      config.selectionMode === 'manual'
        ? `Modèle actif choisi manuellement : ${MODEL_LABELS[activeId] || activeId}.`
        : `Sélection automatique selon F1 — meilleur : ${winnerLabel} (F1 ${benchmark.find((b) => b.id === winnerId)?.f1 ?? '—'}).`,
    architectures: NLP_ARCHITECTURES.map((a) => ({ id: a.id, label: a.label, description: a.description })),
  };
};

const updateNlpModelConfig = async ({ modelId, selectionMode, userId, userName }) => {
  const { benchmark } = benchmarkNlpArchitectures();
  const mode = selectionMode === 'manual' ? 'manual' : 'auto';
  const activeId = resolveActiveModelId(benchmark, mode, modelId);

  const saved = saveConfig({
    activeModelId: activeId,
    selectionMode: mode,
    updatedBy: userName || userId || 'admin',
  });

  const flagged = applySelectionFlags(benchmark, activeId);
  const active = flagged.find((b) => b.id === activeId);

  return {
    ok: true,
    activeModel: {
      id: activeId,
      label: MODEL_LABELS[activeId],
      selectionMode: saved.selectionMode,
      metrics: active
        ? { accuracy: active.accuracy, precision: active.precision, recall: active.recall, f1: active.f1 }
        : null,
      updatedAt: saved.updatedAt,
      updatedBy: saved.updatedBy,
    },
    benchmark: flagged,
  };
};

const predictWithActiveModel = (text) => {
  const config = getConfig();
  const arch = NLP_ARCHITECTURES.find((a) => a.id === config.activeModelId) || NLP_ARCHITECTURES[0];
  const label = arch.predict(text);
  return { label, modelId: arch.id, modelLabel: arch.label };
};

module.exports = {
  getNlpModelBenchmark,
  updateNlpModelConfig,
  predictWithActiveModel,
};
