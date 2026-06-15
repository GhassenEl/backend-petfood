const { predictClinicalUrgency, SYMPTOM_SIGNALS } = require('../ml/clinicalUrgencyModel');
const { buildPetProfile } = require('./vetPetDiagnosis.service');
const { completionWithSystem } = require('./groq.service');
const { isDemoMode } = require('../prismaClient');

const RISK_LABELS = {
  low: { label: 'Risque faible', color: '#16a34a', action: 'Surveillance habituelle' },
  medium: { label: 'Risque modéré', color: '#d97706', action: 'Consultation conseillée sous 7 jours' },
  high: { label: 'Risque élevé', color: '#ea580c', action: 'Consultation prioritaire sous 48 h' },
  critical: { label: 'Risque critique', color: '#dc2626', action: 'Urgence vétérinaire — prise en charge immédiate' },
};

const mapRiskLevel = (ml) => {
  const prob = ml.diseaseProbability ?? 0;
  const urg = ml.urgencyScore ?? 0;
  const score = Math.min(100, Math.round(prob * 55 + urg * 45));

  if (ml.urgencyClass === 'urgent' && (prob >= 0.55 || ml.features?.urgentKeyword)) {
    return { riskLevel: 'critical', riskScore: Math.max(score, 78) };
  }
  if (ml.urgencyClass === 'urgent' || prob >= 0.5 || score >= 65) {
    return { riskLevel: 'high', riskScore: Math.max(score, 55) };
  }
  if (ml.urgency === 'soon' || prob >= 0.32 || score >= 38) {
    return { riskLevel: 'medium', riskScore: Math.max(score, 35) };
  }
  return { riskLevel: 'low', riskScore: Math.min(score, 35) };
};

const parseSymptomLines = (symptoms) => {
  const text = String(symptoms || '').trim();
  if (!text) return [];
  return text
    .split(/[,;\n]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 2);
};

const buildSymptomAnalysis = (symptoms, ml) => {
  const lines = parseSymptomLines(symptoms);
  const matched = ml.features?.signals || [];
  const fromSignals = SYMPTOM_SIGNALS.filter((s) => matched.includes(s.id)).map((s) => ({
    symptom: s.label,
    severity: s.severity,
    source: 'ml_signal',
    riskContribution: s.w >= 2 ? 'high' : 'medium',
  }));

  const fromText = lines
    .filter((line) => !fromSignals.some((f) => line.toLowerCase().includes(f.symptom.toLowerCase().slice(0, 8))))
    .slice(0, 6)
    .map((line) => ({
      symptom: line,
      severity: 'medium',
      source: 'user_report',
      riskContribution: 'medium',
    }));

  return [...fromSignals, ...fromText].slice(0, 10);
};

const buildEarlyWarnings = (ml, symptomAnalysis) => {
  const warnings = [];
  if (ml.urgencyClass === 'urgent') {
    warnings.push({
      type: 'urgency',
      message: 'Signes compatibles avec une urgence — examen clinique immédiat recommandé',
      priority: 'critical',
    });
  }
  if (ml.diseaseSuspected) {
    warnings.push({
      type: 'disease',
      message: 'Suspicion de pathologie — confirmation par examen et tests si nécessaire',
      priority: 'high',
    });
  }
  (ml.suggestedAnomalies || []).slice(0, 4).forEach((a) => {
    warnings.push({
      type: 'anomaly',
      message: a.label,
      priority: a.severity === 'high' ? 'high' : 'medium',
    });
  });
  symptomAnalysis
    .filter((s) => s.severity === 'high')
    .slice(0, 3)
    .forEach((s) => {
      warnings.push({
        type: 'symptom',
        message: `Symptôme à surveiller : ${s.symptom}`,
        priority: 'high',
      });
    });
  return warnings.slice(0, 8);
};

const screeningRecommendations = (ml, pet) => {
  const rec = [];
  const type = pet?.type || 'dog';
  if (ml.features?.signals?.includes('urinary_block')) {
    rec.push({ test: 'ECBU / palpation vessie', reason: 'Trouble urinaire signalé' });
  }
  if (ml.features?.signals?.includes('vomit') || ml.features?.signals?.includes('diarrhea')) {
    rec.push({ test: 'NFS + bilan digestif', reason: 'Signes gastro-intestinaux' });
  }
  if (ml.features?.senior) {
    rec.push({ test: 'Bilan gériatrique (sang, urine)', reason: 'Patient senior' });
  }
  if (ml.diseaseProbability >= 0.4) {
    rec.push({
      test: type === 'cat' ? 'Primo-vaccination / sérologie si besoin' : 'Radiographie thorax si toux',
      reason: 'Risque pathologique modéré à élevé',
    });
  }
  if (!rec.length) {
    rec.push({ test: 'Examen clinique complet', reason: 'Bilan préventif de routine' });
  }
  return rec.slice(0, 5);
};

/**
 * Détection précoce : analyse symptômes + niveau de risque IA.
 */
const analyzeEarlyDiseaseRisk = async ({
  ownerId,
  petId,
  petName,
  animalType,
  symptoms,
  vitals,
  profile: profileIn,
}) => {
  const symptomsText = String(symptoms || '').trim();
  if (!symptomsText) {
    const err = new Error('Renseignez les symptômes observés');
    err.status = 400;
    throw err;
  }

  let profile = profileIn;
  if (!profile && (ownerId || petName)) {
    profile = await buildPetProfile({ ownerId, petId, petName, animalType });
  }
  if (!profile) {
    profile = {
      pet: { name: petName || 'Patient', type: animalType || 'dog', ageYears: null, weightKg: null },
      owner: null,
      history: { records: [], consultations: [] },
    };
  }

  const ml = predictClinicalUrgency({ symptoms: symptomsText, vitals: vitals || {}, profile });
  const { riskLevel, riskScore } = mapRiskLevel(ml);
  const meta = RISK_LABELS[riskLevel];
  const symptomAnalysis = buildSymptomAnalysis(symptomsText, ml);
  const earlyWarnings = buildEarlyWarnings(ml, symptomAnalysis);
  const screening = screeningRecommendations(ml, profile.pet);

  let aiSummary = null;
  if (process.env.GROQ_API_KEY) {
    aiSummary = await completionWithSystem(
      'Tu es vétérinaire PetfoodTN. Réponds en français, 3 phrases max : synthèse détection précoce pour le praticien.',
      `Symptômes: ${symptomsText}\nRisque: ${riskLevel} (${riskScore}/100)\nProbabilité maladie ML: ${Math.round(ml.diseaseProbability * 100)}%\nSignaux: ${(ml.features?.signals || []).join(', ')}`,
      { max_tokens: 220, temperature: 0.2 },
    ).catch(() => null);
  }

  const ruleSummary = [
    `Niveau de risque : ${meta.label} (${riskScore}/100).`,
    `Probabilité pathologie (IA) : ${Math.round((ml.diseaseProbability || 0) * 100)} %.`,
    `${symptomAnalysis.length} symptôme(s) analysé(s), ${earlyWarnings.length} alerte(s) précoce(s).`,
  ].join(' ');

  return {
    agent: 'early_disease_detection_v1',
    model: ml.modelId,
    riskLevel,
    riskScore,
    riskLabel: meta.label,
    riskColor: meta.color,
    recommendedAction: meta.action,
    diseaseProbability: ml.diseaseProbability,
    urgencyScore: ml.urgencyScore,
    urgencyClass: ml.urgencyClass,
    diseaseSuspected: ml.diseaseSuspected,
    symptomAnalysis,
    earlyWarnings,
    screeningRecommendations: screening,
    summary: aiSummary || ruleSummary,
    mlFeatures: ml.features,
    disclaimer:
      'Détection précoce assistée par IA — à confirmer par examen clinique, tests et jugement du vétérinaire.',
  };
};

const demoEarlyDetection = (symptoms) => {
  const ml = predictClinicalUrgency({
    symptoms: symptoms || 'Léthargie, perte d\'appétit depuis 2 jours',
    vitals: {},
    profile: { pet: { name: 'Médor', type: 'dog', ageYears: 8 } },
  });
  const { riskLevel, riskScore } = mapRiskLevel(ml);
  const meta = RISK_LABELS[riskLevel];
  return {
    agent: 'early_disease_detection_v1',
    model: ml.modelId,
    riskLevel,
    riskScore,
    riskLabel: meta.label,
    riskColor: meta.color,
    recommendedAction: meta.action,
    diseaseProbability: ml.diseaseProbability,
    urgencyScore: ml.urgencyScore,
    urgencyClass: ml.urgencyClass,
    diseaseSuspected: ml.diseaseSuspected,
    symptomAnalysis: buildSymptomAnalysis(symptoms, ml),
    earlyWarnings: buildEarlyWarnings(ml, []),
    screeningRecommendations: [{ test: 'NFS + bilan digestif', reason: 'Mode démo' }],
    summary: 'Détection précoce (démo) — surveiller hydratation et appétit sous 48 h.',
    disclaimer: 'Mode démo — suggestion IA non diagnostique.',
  };
};

module.exports = {
  analyzeEarlyDiseaseRisk,
  demoEarlyDetection,
  RISK_LABELS,
  mapRiskLevel,
};
