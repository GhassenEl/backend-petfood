/**
 * Modèle ML triage clinique vétérinaire (Node, sans Python).
 * Régression logistique sur signes textuels, vitaux et profil patient.
 * ID: clinical_logistic_v1
 */

const SYMPTOM_SIGNALS = [
  { id: 'respiratory', re: /dyspn|respir|suffoc|halèt|éternu/i, w: 2.4, label: 'Détresse respiratoire possible', severity: 'high' },
  { id: 'neuro', re: /convuls|crise|épilep|perte de connaissance|coma/i, w: 3.0, label: 'Signes neurologiques', severity: 'high' },
  { id: 'hemorrhage', re: /sang|hémorrag|saign/i, w: 2.6, label: 'Saignement signalé', severity: 'high' },
  { id: 'urinary_block', re: /urin|pipi|vessie|strangur/i, w: 2.2, label: 'Trouble urinaire', severity: 'high' },
  { id: 'trauma', re: /accident|choc|fracture|traum/i, w: 2.5, label: 'Traumatisme suspecté', severity: 'high' },
  { id: 'vomit', re: /vomis|vomir|vomit/i, w: 1.2, label: 'Trouble digestif (vomissement)', severity: 'medium' },
  { id: 'diarrhea', re: /diarr|diarrhée|selles liquides/i, w: 1.1, label: 'Trouble digestif (diarrhée)', severity: 'medium' },
  { id: 'skin', re: /gratt|démang|demang|peau|pelage|alopec/i, w: 0.9, label: 'Atteinte cutanée possible', severity: 'medium' },
  { id: 'lethargy', re: /létharg|fatigu|abatt|letharg|prostr/i, w: 1.8, label: 'Asthénie / léthargie', severity: 'high' },
  { id: 'pain', re: /douleur|crie|gémit|boite|boiter/i, w: 1.5, label: 'Douleur signalée', severity: 'medium' },
  { id: 'fever', re: /fièvre|fievre|température élev|hypertherm/i, w: 1.6, label: 'Fièvre / hyperthermie', severity: 'medium' },
  { id: 'dehydration', re: /déshydrat|deshydrat|ne boit plus|refus.*eau/i, w: 1.7, label: 'Risque de déshydratation', severity: 'high' },
  { id: 'appetite', re: /anorex|perte d.?appétit|ne mange plus|refus.*nourriture/i, w: 1.0, label: 'Anorexie', severity: 'medium' },
];

const URGENT_KEYWORDS = /urgent|immédiat|critique|détresse|convuls|hémorrag|ne respire|inconscient/i;

const sigmoid = (z) => 1 / (1 + Math.exp(-z));

const parseVitalNumber = (v) => {
  if (v == null || v === '') return null;
  const n = Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};

const extractFeatures = ({ symptoms = '', vitals = {}, profile = {} }) => {
  const text = String(symptoms).toLowerCase();
  const pet = profile?.pet || profile || {};
  const type = (pet.type || 'other').toLowerCase();
  const ageYears = pet.ageYears != null ? Number(pet.ageYears) : null;
  const weightKg = parseVitalNumber(vitals.weight ?? pet.weightKg);
  const tempC = parseVitalNumber(vitals.temperature);
  const heartRate = parseVitalNumber(vitals.heartRate);

  const matchedSignals = SYMPTOM_SIGNALS.filter((s) => s.re.test(text));
  const symptomScore = matchedSignals.reduce((sum, s) => sum + s.w, 0);
  const urgentKeyword = URGENT_KEYWORDS.test(text) ? 1 : 0;

  let vitalScore = 0;
  if (tempC != null) {
    const high = type === 'cat' ? tempC > 39.5 : tempC > 39.2;
    const low = tempC < 37.5;
    if (high || low) vitalScore += 1.4;
  }
  if (heartRate != null) {
    const hrHigh = type === 'cat' ? heartRate > 220 : heartRate > 160;
    const hrLow = type === 'cat' ? heartRate < 120 : heartRate < 60;
    if (hrHigh || hrLow) vitalScore += 1.0;
  }
  if (weightKg != null && weightKg < 1) vitalScore += 0.5;

  const senior = ageYears != null && ageYears >= 10 ? 0.6 : ageYears != null && ageYears >= 7 ? 0.35 : 0;
  const chronic =
    pet.chronicConditions && String(pet.chronicConditions).trim().length > 2 ? 0.5 : 0;
  const allergyFlag = pet.allergies && String(pet.allergies).trim().length > 2 ? 0.15 : 0;

  const historyRisk =
    (profile?.history?.records || []).some((r) =>
      /chronique|insuffis|cardiaque|renal|diabète/i.test(
        `${r.diagnosis || ''} ${r.chronicDiseases || ''}`
      )
    )
      ? 0.45
      : 0;

  return {
    symptomScore,
    urgentKeyword,
    vitalScore,
    senior,
    chronic,
    allergyFlag,
    historyRisk,
    matchedSignals,
    featureCount: matchedSignals.length + (vitalScore > 0 ? 1 : 0),
  };
};

/**
 * @param {{ symptoms?: string, vitals?: object, profile?: object }} input
 * @returns {object}
 */
const predictClinicalUrgency = (input) => {
  const features = extractFeatures(input);
  const z =
    -1.35 +
    0.55 * features.symptomScore +
    1.2 * features.urgentKeyword +
    0.65 * features.vitalScore +
    features.senior +
    features.chronic +
    features.historyRisk +
    features.allergyFlag;

  const diseaseProbability = Math.round(sigmoid(z) * 1000) / 1000;
  const urgencyScore = Math.min(
    1,
    Math.round((diseaseProbability * 0.7 + features.symptomScore / 8 + features.urgentKeyword * 0.25) * 1000) /
      1000
  );

  let urgencyClass = 'non_urgent';
  let urgency = 'routine';
  if (urgencyScore >= 0.72 || features.urgentKeyword || features.symptomScore >= 4.5) {
    urgencyClass = 'urgent';
    urgency = 'urgent';
  } else if (urgencyScore >= 0.42 || features.symptomScore >= 2) {
    urgency = 'soon';
  }

  const diseaseSuspected = diseaseProbability >= 0.45 || features.symptomScore >= 2.5;

  const suggestedAnomalies = features.matchedSignals.map((s) => ({
    label: s.label,
    severity: s.severity,
    description: `Signal ML (${s.id}) — corrélation symptômes / profil.`,
    likelyDisease: s.severity === 'high',
    source: 'ml',
  }));

  if (!suggestedAnomalies.length && diseaseProbability >= 0.35) {
    suggestedAnomalies.push({
      label: 'Risque clinique modéré (modèle)',
      severity: 'low',
      description: 'Score agrégé sans motif textuel fort — examen recommandé.',
      likelyDisease: false,
      source: 'ml',
    });
  }

  return {
    modelId: 'clinical_logistic_v1',
    modelType: 'logistic_regression',
    diseaseProbability,
    urgencyScore,
    urgencyClass,
    urgency,
    diseaseSuspected,
    suggestedAnomalies,
    features: {
      symptomScore: features.symptomScore,
      vitalScore: features.vitalScore,
      urgentKeyword: Boolean(features.urgentKeyword),
      senior: features.senior > 0,
      chronic: features.chronic > 0,
      historyRisk: features.historyRisk > 0,
      signals: features.matchedSignals.map((s) => s.id),
    },
  };
};

const mergeMlWithAnalysis = (analysis, ml) => {
  if (!ml) return analysis;

  const out = { ...analysis, mlModel: ml };

  const groqOrRules = analysis.aiPowered !== false;
  const existing = analysis.anomalies || [];
  const mlOnly = (ml.suggestedAnomalies || []).filter(
    (a) => !existing.some((e) => e.label === a.label)
  );

  if (!groqOrRules || existing.length === 0) {
    out.anomalies = [...existing, ...mlOnly].slice(0, 8);
    if (!out.anomalies.length && mlOnly.length) out.anomalies = mlOnly;
  } else if (ml.urgencyClass === 'urgent') {
    out.anomalies = [...existing, ...mlOnly.slice(0, 2)].slice(0, 8);
  }

  if (ml.urgencyClass === 'urgent' && out.urgencyClass !== 'urgent') {
    out.urgencyClass = 'urgent';
    out.urgency = 'urgent';
  } else if (ml.urgency === 'soon' && out.urgency === 'routine') {
    out.urgency = 'soon';
  }

  out.diseaseSuspected = Boolean(out.diseaseSuspected || ml.diseaseSuspected);
  out.mlPowered = true;

  return out;
};

module.exports = {
  predictClinicalUrgency,
  mergeMlWithAnalysis,
  extractFeatures,
  SYMPTOM_SIGNALS,
};
