const { analyzeTextFull } = require('./nlpTextAnalysis.service');

const TOXIC_WORDS = [
  'connard', 'salope', 'pute', 'merde', 'idiot', 'imbecile', 'imbécile', 'debile', 'débile',
  'naze', 'pourri', 'ta gueule', 'fermez la', 'haine', 'deteste', 'déteste', 'arnaqueur',
  'escroc', 'voleur', 'nul', 'minable', 'stupide',
];

const SPAM_MARKERS = /\b(visitez|cliquez|http|www\.|promo code|gagnez|gratuit)\b/i;

const computeSpamScore = (comment = '') => {
  const text = String(comment).trim();
  if (!text) return 0.9;
  const lower = text.toLowerCase();
  const words = lower.split(/\s+/);
  const unique = new Set(words);
  const repeatRatio = words.length ? 1 - unique.size / words.length : 0;
  const exclam = (text.match(/!/g) || []).length;
  const stars = (text.match(/★/g) || []).length;
  const caps = (text.match(/[A-ZÀ-Ÿ]{3,}/g) || []).length;
  let score = 0.05;
  if (repeatRatio > 0.35) score += 0.35;
  if (exclam >= 3) score += 0.25;
  if (stars >= 3) score += 0.3;
  if (caps >= 2) score += 0.15;
  if (/\b(arnaque|spam|fake|bot)\b/i.test(text)) score += 0.2;
  if (SPAM_MARKERS.test(text)) score += 0.25;
  if (words.length <= 4 && text.length < 30) score += 0.15;
  return Math.min(0.99, score);
};

const detectInsults = (comment = '') => {
  const lower = String(comment).toLowerCase();
  const found = TOXIC_WORDS.filter((w) => lower.includes(w));
  return { detected: found.length > 0, terms: found };
};

const coherenceScore = (comment, rating) => {
  const nlp = analyzeTextFull(comment);
  const pos = nlp.words?.keywords?.positive?.length || 0;
  const neg = nlp.words?.keywords?.negative?.length || 0;
  const label = nlp.sentiment?.label || 'neutral';
  let expected = 3;
  if (label === 'positive' || pos > neg + 1) expected = 4.5;
  else if (label === 'negative' || neg > pos + 1) expected = 2;
  else if (pos > 0 && neg === 0) expected = 4;
  else if (neg > 0 && pos === 0) expected = 2.5;

  const gap = Math.abs(Number(rating || 3) - expected);
  return Math.max(0, Math.min(1, 1 - gap / 3));
};

const analyzeReviewForModeration = (comment = '', rating = 3) => {
  const nlp = analyzeTextFull(comment);
  const insults = detectInsults(comment);
  const spamProbability = computeSpamScore(comment);
  const coherence = coherenceScore(comment, rating);
  const suspiciousFlags = [];

  if (insults.detected) suspiciousFlags.push('insulte');
  if (spamProbability >= 0.55) suspiciousFlags.push('spam');
  if (coherence < 0.45) suspiciousFlags.push('incoherence_note');
  if (Number(rating) >= 5 && (nlp.words?.keywords?.negative?.length || 0) > 0) suspiciousFlags.push('note_trop_positive');
  if (Number(rating) <= 2 && (nlp.words?.keywords?.positive?.length || 0) > 0) suspiciousFlags.push('note_trop_negative');
  if (!String(comment).trim()) suspiciousFlags.push('commentaire_vide');

  const nlpScore = Math.round(
    (coherence * 0.4 + (1 - spamProbability) * 0.35 + (insults.detected ? 0 : 0.25)) * 100
  );

  return {
    spamProbability,
    insultDetected: insults.detected,
    insultTerms: insults.terms,
    coherenceScore: Math.round(coherence * 100),
    nlpScore,
    sentiment: nlp.sentiment?.label || 'neutral',
    suspiciousFlags,
    shouldFlag: spamProbability >= 0.5 || insults.detected || coherence < 0.4 || suspiciousFlags.length >= 2,
  };
};

module.exports = {
  analyzeReviewForModeration,
  computeSpamScore,
  detectInsults,
  coherenceScore,
};
