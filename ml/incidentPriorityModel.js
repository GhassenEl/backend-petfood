const { sigmoid, clamp01 } = require('./shared');

const CATEGORY_RULES = [
  { id: 'delivery', re: /livraison|livreur|colis|retard|perdu/i, w: 2.2 },
  { id: 'service_grooming', re: /toilettage|coupe|bain|griffe/i, w: 2.0 },
  { id: 'service_vet', re: /vétérinaire|vet|consultation|vaccin|clinique/i, w: 2.1 },
  { id: 'payment', re: /payer|paiement|facture|rembours|wallet|carte/i, w: 1.9 },
  { id: 'account', re: /compte|connexion|mot de passe|profil/i, w: 1.5 },
  { id: 'product', re: /produit|croquette|commande|article|défectueux/i, w: 1.8 },
  { id: 'quality', re: /dressage|pension|service|qualité/i, w: 1.4 },
];

const predictIncidentPriority = ({ subject = '', message = '', priorCount = 0, emotion = 'neutral', orderTotal = 0 }) => {
  const text = `${subject} ${message}`.toLowerCase();
  const matched = CATEGORY_RULES.filter((r) => r.re.test(text));
  const categoryScore = matched.reduce((s, r) => s + r.w, 0);
  const category = matched.sort((a, b) => b.w - a.w)[0]?.id || 'other';

  let z =
    -0.8 +
    0.35 * categoryScore +
    (priorCount >= 3 ? 0.55 : priorCount >= 1 ? 0.25 : 0) +
    (orderTotal > 500 ? 0.35 : orderTotal > 200 ? 0.15 : 0);

  if (/urgent|immédiat|danger|scandale|inadmissible/i.test(text)) z += 2.2;
  if (emotion === 'frustrated' || /frustr|énerv|colère/i.test(text)) z += 1.1;
  if (emotion === 'disappointed' || /déçu|mauvais/i.test(text)) z += 0.6;
  if (/retard|perdu|arnaque|fraude/i.test(text)) z += 0.9;

  const priorityScore = sigmoid(z);
  let priority = 'low';
  if (priorityScore >= 0.78) priority = 'urgent';
  else if (priorityScore >= 0.55) priority = 'high';
  else if (priorityScore >= 0.35) priority = 'medium';

  const confidence = clamp01(0.55 + Math.min(categoryScore / 6, 0.35) + (matched.length ? 0.1 : 0));

  return {
    modelId: 'incident_logistic_v1',
    modelType: 'logistic_regression',
    category,
    priority,
    priorityScore: Math.round(priorityScore * 1000) / 1000,
    confidence: Math.round(confidence * 1000) / 1000,
    autoResolvable: priority === 'low' && emotion !== 'frustrated' && priorCount < 2,
    features: { categoryScore, priorCount, emotion, signals: matched.map((m) => m.id) },
  };
};

const mergeMlIncident = (analysis, ml) => {
  if (!ml) return analysis;
  const out = { ...analysis, mlModel: ml, mlPowered: true };
  if ((ml.confidence || 0) >= (analysis.confidence || 0) * 0.9) {
    out.category = ml.category;
    out.priority = ml.priority;
    out.confidence = Math.max(analysis.confidence || 0, ml.confidence);
    out.autoResolvable = ml.autoResolvable && analysis.autoResolvable !== false;
  } else if (ml.priority === 'urgent' && analysis.priority !== 'urgent') {
    out.priority = 'urgent';
    out.confidence = Math.max(out.confidence || 0, ml.confidence);
  }
  return out;
};

module.exports = { predictIncidentPriority, mergeMlIncident, CATEGORY_RULES };
