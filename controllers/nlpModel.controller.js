const {
  getNlpModelBenchmark,
  updateNlpModelConfig,
} = require('../services/nlpModelSelection.service');
const { analyzeTextFull } = require('../services/nlpTextAnalysis.service');

const handleError = (res, error, code = 500) => {
  console.error('NLP model error:', error);
  res.status(error.status || code).json({ error: error.message || 'Erreur modèles NLP' });
};

const getNlpBenchmarkHandler = async (req, res) => {
  try {
    const result = await getNlpModelBenchmark();
    res.json(result);
  } catch (error) {
    handleError(res, error);
  }
};

const getNlpConfigHandler = async (req, res) => {
  try {
    const result = await getNlpModelBenchmark();
    res.json({
      activeModel: result.activeModel,
      recommendedModelId: result.recommendedModelId,
      task: result.task,
    });
  } catch (error) {
    handleError(res, error);
  }
};

const putNlpConfigHandler = async (req, res) => {
  try {
    const { modelId, selectionMode } = req.body || {};
    const result = await updateNlpModelConfig({
      modelId,
      selectionMode,
      userId: req.user?.id || req.user?._id,
      userName: req.user?.name,
    });
    res.json(result);
  } catch (error) {
    handleError(res, error);
  }
};

const postNlpAnalyzeHandler = async (req, res) => {
  try {
    const { text } = req.body || {};
    if (!text || !String(text).trim()) {
      return res.status(400).json({ error: 'Texte requis' });
    }
    const analysis = analyzeTextFull(String(text).trim());
    res.json({ ok: true, analysis });
  } catch (error) {
    handleError(res, error);
  }
};

module.exports = {
  getNlpBenchmarkHandler,
  getNlpConfigHandler,
  putNlpConfigHandler,
  postNlpAnalyzeHandler,
};
