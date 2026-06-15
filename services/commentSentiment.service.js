const { analyzeTextFull } = require('./nlpTextAnalysis.service');
const { emotionMeta } = require('../utils/ownerEmotionConstants');

const emotionToSentiment = (emotion) => {
  if (['happy', 'satisfied'].includes(emotion)) return 'positive';
  if (['disappointed', 'frustrated'].includes(emotion)) return 'negative';
  return 'neutral';
};

const analyzeCommentText = (text, options = {}) => {
  const trimmed = String(text || '').trim();
  if (!trimmed) {
    const emotion = options.emotion || 'neutral';
    return {
      sentiment: emotionToSentiment(emotion),
      emotion,
      emotionLabel: emotionMeta(emotion).label,
      emotionEmoji: emotionMeta(emotion).emoji,
      confidence: 0.4,
      keywords: { positive: [], negative: [], neutral: [] },
      topTerms: [],
      modelId: null,
      insight: 'Pas de commentaire',
      anomaly: null,
    };
  }

  const nlp = analyzeTextFull(trimmed);
  return {
    sentiment: nlp.sentiment?.label || emotionToSentiment(nlp.emotion),
    emotion: nlp.emotion,
    emotionLabel: nlp.emotionLabel,
    emotionEmoji: nlp.emotionEmoji,
    confidence: nlp.confidence,
    keywords: nlp.words?.keywords || { positive: [], negative: [], neutral: [] },
    topTerms: (nlp.words?.topTerms || []).slice(0, 5),
    modelId: nlp.sentiment?.modelId,
    modelLabel: nlp.sentiment?.modelLabel,
    insight: nlp.insight,
    anomaly: nlp.anomaly?.detected ? nlp.anomaly.primary : null,
    polarityScore: nlp.words?.polarityScore,
  };
};

module.exports = {
  emotionToSentiment,
  analyzeCommentText,
};
