const { predictWithActiveModel } = require('./nlpModelSelection.service');

const STOP_WORDS = new Set([
  'le', 'la', 'les', 'un', 'une', 'des', 'de', 'du', 'et', 'ou', 'je', 'tu', 'il', 'elle',
  'nous', 'vous', 'mon', 'ma', 'mes', 'ton', 'ta', 'tes', 'son', 'sa', 'ses', 'ce', 'cette',
  'ces', 'qui', 'que', 'quoi', 'pour', 'par', 'sur', 'avec', 'sans', 'dans', 'est', 'sont',
  'pas', 'plus', 'tres', 'très', 'a', 'au', 'aux', 'en', 'ne', 'se', 'si', 'ca', 'ça',
]);

const POSITIVE_WORDS = [
  'excellent', 'super', 'parfait', 'adorable', 'genial', 'génial', 'merveilleux', 'fantastique',
  'rapide', 'recommande', 'satisfait', 'qualite', 'qualité', 'merci', 'content', 'heureux',
  'ravi', 'bien', 'top', 'formidable', 'magnifique',
];

const NEGATIVE_WORDS = [
  'mauvais', 'nul', 'horrible', 'decevant', 'décevant', 'frustrant', 'decu', 'déçu', 'retard',
  'casse', 'cassé', 'attente', 'probleme', 'problème', 'reclamation', 'réclamation', 'insatisfait',
  'lent', 'arnaque', 'scandale', 'inadmissible', 'colère', 'fâché', 'fache', 'énervé', 'enerve',
];

const NEUTRAL_WORDS = ['correct', 'moyen', 'standard', 'normal', 'acceptable', 'sans plus', 'classique'];

const TOXIC_WORDS = [
  'connard', 'salope', 'pute', 'merde', 'idiot', 'imbecile', 'imbécile', 'debile', 'débile',
  'naze', 'pourri', 'ferme', 'ta gueule', 'fermez la', 'haine', 'deteste', 'déteste',
];

const URGENCY_WORDS = [
  'urgence', 'urgent', 'mort', 'mour', 'saign', 'convulsion', 'empoison', 'intox',
  'difficulté respiratoire', 'difficulte respiratoire', 'coma', 'accident', 'sauver',
  'aide immédiate', 'immédiat', 'immediat', 'danger',
];

const PET_ENTITIES = [
  { id: 'dog', words: ['chien', 'chiot', 'canin'] },
  { id: 'cat', words: ['chat', 'chaton', 'félin', 'felin'] },
  { id: 'bird', words: ['oiseau', 'perroquet', 'canari'] },
  { id: 'fish', words: ['poisson', 'aquarium'] },
  { id: 'rodent', words: ['lapin', 'hamster', 'rongeur'] },
];

const SERVICE_ENTITIES = [
  { id: 'delivery', words: ['livraison', 'livreur', 'colis', 'expedition', 'expédition'] },
  { id: 'payment', words: ['paiement', 'facture', 'stripe', 'carte', 'remboursement'] },
  { id: 'product', words: ['produit', 'croquette', 'croquettes', 'pâtée', 'patee', 'nourriture'] },
  { id: 'vet', words: ['vétérinaire', 'veterinaire', 'consultation', 'ordonnance', 'vaccin'] },
  { id: 'complaint', words: ['réclamation', 'reclamation', 'plainte', 'sav', 'retour'] },
  { id: 'iot', words: ['iot', 'esp32', 'distributeur', 'fontaine', 'connecte', 'capteur', 'feeder'] },
  { id: 'traceability', words: ['tracabilite', 'blockchain', 'origine', 'certification', 'lot'] },
  { id: 'loyalty', words: ['fidelite', 'points', 'recompense', 'reward'] },
];

const tokenize = (text) =>
  String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 1);

const matchLexicon = (tokens, lexicon) =>
  lexicon.filter((word) =>
    tokens.some((t) => {
      if (t === word) return true;
      if (word.length >= 4 && t.startsWith(word)) return true;
      if (t.length >= 4 && word.startsWith(t)) return true;
      return false;
    })
  );

const detectEntities = (tokens, catalog) =>
  catalog
    .filter((row) =>
      row.words.some((w) =>
        tokens.some((t) => {
          if (t === w) return true;
          if (w.length >= 4 && t.startsWith(w)) return true;
          if (t.length >= 4 && w.startsWith(t)) return true;
          return false;
        })
      )
    )
    .map((row) => row.id);

const frequencyMap = (tokens) => {
  const freq = {};
  tokens.forEach((t) => {
    if (STOP_WORDS.has(t)) return;
    freq[t] = (freq[t] || 0) + 1;
  });
  return Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([word, count]) => ({ word, count }));
};

const analyzeWords = (text) => {
  const tokens = tokenize(text);
  const positive = matchLexicon(tokens, POSITIVE_WORDS);
  const negative = matchLexicon(tokens, NEGATIVE_WORDS);
  const neutral = matchLexicon(tokens, NEUTRAL_WORDS);
  const topTerms = frequencyMap(tokens);

  return {
    wordCount: tokens.length,
    uniqueWords: new Set(tokens).size,
    tokens: tokens.slice(0, 30),
    keywords: {
      positive,
      negative,
      neutral,
    },
    topTerms,
    entities: {
      pets: detectEntities(tokens, PET_ENTITIES),
      services: detectEntities(tokens, SERVICE_ENTITIES),
    },
    polarityScore: Number(
      ((positive.length - negative.length) / Math.max(1, tokens.length)).toFixed(3)
    ),
  };
};

const detectTextAnomalies = (text, words, sentiment) => {
  const raw = String(text || '');
  const lower = raw.toLowerCase();
  const anomalies = [];

  if (TOXIC_WORDS.some((w) => lower.includes(w))) {
    anomalies.push({ type: 'toxic', severity: 'high', label: 'Langage agressif détecté' });
  }

  if (URGENCY_WORDS.some((w) => lower.includes(w))) {
    anomalies.push({ type: 'urgency', severity: 'high', label: 'Signal d\'urgence détecté' });
  }

  if (/(.)\1{6,}/.test(raw) || /(https?:\/\/\S+\s*){3,}/i.test(raw)) {
    anomalies.push({ type: 'spam', severity: 'medium', label: 'Contenu répétitif ou spam' });
  }

  if (/<script|javascript:|union select|drop table/i.test(raw)) {
    anomalies.push({ type: 'injection', severity: 'high', label: 'Tentative d\'injection détectée' });
  }

  if (raw.length > 20 && (raw.match(/[A-ZÀ-Ü]/g) || []).length / raw.length > 0.55) {
    anomalies.push({ type: 'caps_lock', severity: 'low', label: 'Message en majuscules excessives' });
  }

  if (
    sentiment?.label === 'negative' &&
    words.keywords.negative.length >= 3 &&
    words.polarityScore < -0.15
  ) {
    anomalies.push({ type: 'negative_spike', severity: 'medium', label: 'Forte charge négative' });
  }

  const primary = anomalies.sort((a, b) => {
    const rank = { high: 3, medium: 2, low: 1 };
    return (rank[b.severity] || 0) - (rank[a.severity] || 0);
  })[0];

  return {
    detected: anomalies.length > 0,
    count: anomalies.length,
    items: anomalies,
    primary: primary || null,
    riskScore: Math.min(1, anomalies.reduce((s, a) => s + (a.severity === 'high' ? 0.4 : a.severity === 'medium' ? 0.25 : 0.1), 0)),
  };
};

const EMOTION_META = {
  happy: { label: 'Très heureux', emoji: '😊' },
  satisfied: { label: 'Satisfait', emoji: '🙂' },
  neutral: { label: 'Neutre', emoji: '😐' },
  disappointed: { label: 'Déçu', emoji: '😞' },
  frustrated: { label: 'Frustré', emoji: '😠' },
};

const resolveEmotion = (sentiment, words, anomaly) => {
  if (anomaly?.primary?.type === 'urgency') {
    return { emotion: 'frustrated', confidence: 0.85 };
  }

  const neg = words.keywords.negative;
  const pos = words.keywords.positive;

  if (neg.some((w) => ['frustr', 'colère', 'enerve', 'énerv', 'inadmissible', 'scandale'].some((k) => w.includes(k)))) {
    return { emotion: 'frustrated', confidence: 0.82 };
  }
  if (neg.length >= 2 || sentiment.label === 'negative') {
    return { emotion: 'disappointed', confidence: 0.75 };
  }
  if (pos.some((w) => ['excellent', 'parfait', 'adorable', 'magnifique', 'ravi'].some((k) => w.includes(k)))) {
    return { emotion: 'happy', confidence: 0.8 };
  }
  if (pos.length >= 1 || sentiment.label === 'positive') {
    return { emotion: 'satisfied', confidence: 0.72 };
  }
  return { emotion: 'neutral', confidence: 0.55 };
};

const analyzeTextFull = (text) => {
  const trimmed = String(text || '').trim();
  if (!trimmed) {
    return {
      sentiment: { label: 'neutral', modelId: null, modelLabel: null },
      emotion: 'neutral',
      emotionLabel: EMOTION_META.neutral.label,
      emotionEmoji: EMOTION_META.neutral.emoji,
      confidence: 0.4,
      words: analyzeWords(''),
      anomaly: { detected: false, count: 0, items: [], primary: null, riskScore: 0 },
      insight: 'Texte vide',
    };
  }

  const words = analyzeWords(trimmed);
  const prediction = predictWithActiveModel(trimmed);
  const sentiment = {
    label: prediction.label,
    modelId: prediction.modelId,
    modelLabel: prediction.modelLabel,
  };

  const anomaly = detectTextAnomalies(trimmed, words, sentiment);
  const { emotion, confidence } = resolveEmotion(sentiment, words, anomaly);
  const meta = EMOTION_META[emotion] || EMOTION_META.neutral;

  const keywordSummary = [
    ...words.keywords.positive.slice(0, 2).map((w) => `+${w}`),
    ...words.keywords.negative.slice(0, 2).map((w) => `-${w}`),
  ].join(', ');

  return {
    sentiment,
    emotion,
    emotionLabel: meta.label,
    emotionEmoji: meta.emoji,
    confidence,
    words,
    anomaly,
    insight: keywordSummary
      ? `Mots clés : ${keywordSummary} · modèle ${prediction.modelLabel}`
      : `Analyse ${prediction.modelLabel} → ${meta.label}`,
  };
};

module.exports = {
  analyzeTextFull,
  analyzeWords,
  detectTextAnomalies,
  tokenize,
};
