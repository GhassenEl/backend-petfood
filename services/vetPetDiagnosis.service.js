const { prisma, isDemoMode } = require('../prismaClient');
const { completionWithSystem } = require('./groq.service');
const { getHealthRecommendations } = require('./healthRecommendations.service');

const ANALYSIS_SYSTEM = `Tu es un assistant clinique vétérinaire PetfoodTN.
Analyse les symptômes et le profil animal pour détecter des anomalies et proposer des pistes.
IMPORTANT :
- Réponds UNIQUEMENT avec un objet JSON valide (pas de markdown).
- Ne remplace pas l'examen clinique du vétérinaire.
- Structure exacte :
{
  "anomalies": [{"label":"...", "severity":"low|medium|high", "description":"...", "likelyDisease": true|false}],
  "diagnosticHypotheses": [{"condition":"...", "confidence":"low|medium|high", "rationale":"..."}],
  "recommendedMedications": [{"name":"...", "dosage":"...", "frequency":"...", "duration":"...", "notes":"..."}],
  "recommendedVaccines": [{"name":"...", "schedule":"...", "reason":"..."}],
  "dietPlan": {"summary":"...", "mealsPerDay":"...", "recommendedFoods":["..."], "foodsToAvoid":["..."], "supplements":["..."]},
  "clinicalNotes": "...",
  "urgency": "routine|soon|urgent",
  "urgencyClass": "urgent|non_urgent",
  "diseaseSuspected": true|false,
  "healthFollowUp": {"nextVisitDays": 7, "monitoring":["..."], "warningSigns":["..."]},
  "followUpDays": 7
}`;

const petAgeYears = (birthDate) => {
  if (!birthDate) return null;
  const birth = new Date(birthDate);
  if (Number.isNaN(birth.getTime())) return null;
  const today = new Date();
  let years = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) years -= 1;
  return Math.max(0, years);
};

const normalizePetType = (t) => {
  const s = (t || 'other').toLowerCase();
  if (['dog', 'chien'].some((x) => s.includes(x))) return 'dog';
  if (['cat', 'chat'].some((x) => s.includes(x))) return 'cat';
  if (['bird', 'oiseau'].some((x) => s.includes(x))) return 'bird';
  if (['fish', 'poisson'].some((x) => s.includes(x))) return 'fish';
  return 'other';
};

const buildPetProfile = async ({ ownerId, petId, petName, animalType }) => {
  let pet = null;
  if (petId) {
    pet = await prisma.pet.findUnique({ where: { id: petId } });
  } else if (ownerId && petName) {
    pet = await prisma.pet.findFirst({
      where: { ownerId, name: petName },
    });
  }

  const owner = ownerId
    ? await prisma.user.findUnique({
        where: { id: ownerId },
        select: { id: true, name: true, email: true, phone: true, region: true },
      })
    : null;

  const resolvedName = pet?.name || petName || 'Patient';
  const resolvedType = normalizePetType(pet?.type || animalType);
  const ageYears = petAgeYears(pet?.birthDate);

  const [consultations, records, vaccines, prescriptions] = await Promise.all([
    prisma.vetConsultation.findMany({
      where: {
        ownerId: ownerId || undefined,
        petName: resolvedName,
      },
      orderBy: { updatedAt: 'desc' },
      take: 5,
      select: {
        diagnosis: true,
        symptoms: true,
        recommendations: true,
        status: true,
        updatedAt: true,
      },
    }),
    prisma.veterinaryRecord.findMany({
      where: {
        ownerId: ownerId || undefined,
        petName: resolvedName,
      },
      orderBy: { visitDate: 'desc' },
      take: 5,
      select: {
        diagnosis: true,
        medications: true,
        visitDate: true,
        vetNotes: true,
        allergies: true,
        chronicDiseases: true,
        diet: true,
        weight: true,
        temperature: true,
      },
    }),
    prisma.petVaccine.findMany({
      where: {
        ownerId: ownerId || undefined,
        petName: resolvedName,
      },
      orderBy: { dateAdministered: 'desc' },
      take: 8,
    }),
    prisma.prescription.findMany({
      where: {
        ownerId: ownerId || undefined,
        petName: resolvedName,
      },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: { medications: true, instructions: true, createdAt: true },
    }),
  ]);

  const latestRecord = records[0];
  const chronicFromRecord = latestRecord?.chronicDiseases || null;
  const allergiesFromRecord = latestRecord?.allergies || null;
  const dietFromRecord = latestRecord?.diet || null;

  return {
    pet: {
      id: pet?.id,
      name: resolvedName,
      type: resolvedType,
      breed: pet?.breed || null,
      ageYears,
      weightKg: pet?.weight ?? latestRecord?.weight ?? null,
      notes: pet?.notes || null,
      allergies: allergiesFromRecord,
      chronicConditions: chronicFromRecord,
      currentDiet: dietFromRecord,
    },
    owner,
    history: {
      consultations,
      records,
      vaccines: vaccines.map((v) => ({
        type: v.vaccineType,
        administered: v.dateAdministered,
        nextDue: v.nextDue,
        status: v.status,
      })),
      prescriptions,
    },
  };
};

const parseJsonFromText = (text) => {
  if (!text) return null;
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch {
        return null;
      }
    }
  }
  return null;
};

const ruleBasedAnalysis = async (profile, symptoms) => {
  const petType = profile.pet.type;
  const health = await getHealthRecommendations(petType);
  const symptomLower = (symptoms || '').toLowerCase();

  const anomalies = [];
  if (/vomit|diarr|diarrhée|vomir/i.test(symptomLower)) {
    anomalies.push({
      label: 'Trouble digestif',
      severity: 'medium',
      description: 'Signes gastro-intestinaux signalés — surveiller hydratation et appétit.',
    });
  }
  if (/gratt|démang|demang|peau|pelage/i.test(symptomLower)) {
    anomalies.push({
      label: 'Atteinte cutanée possible',
      severity: 'medium',
      description: 'Prurit ou lésions cutanées — éliminer parasites externes.',
    });
  }
  if (/létharg|fatigu|abatt|letharg/i.test(symptomLower)) {
    anomalies.push({
      label: 'Asthénie',
      severity: 'high',
      description: 'Baisse d\'activité — évaluer température et douleur.',
    });
  }
  if (!anomalies.length) {
    anomalies.push({
      label: 'Signes non spécifiques',
      severity: 'low',
      description: 'Analyse basée sur le profil et les symptômes déclarés — examen clinique recommandé.',
    });
  }

  const meds = (health.medicines || []).slice(0, 2).map((m) => ({
    name: m.name,
    dosage: 'Selon notice',
    frequency: '1×/jour',
    duration: '7 jours',
    notes: m.reason || 'Adapté au profil espèce',
  }));

  const vaccines = (health.vaccines || []).slice(0, 3).map((v) => ({
    name: v,
    schedule: 'À planifier',
    reason: 'Calendrier préventif espèce',
  }));

  return {
    anomalies,
    diagnosticHypotheses: [
      {
        condition: 'Étiologie à confirmer à l\'examen',
        confidence: 'low',
        rationale: `Symptômes : ${symptoms || 'non précisés'}. Profil : ${profile.pet.name}, ${petType}, ${profile.pet.ageYears ?? '?'} an(s).`,
      },
    ],
    recommendedMedications: meds,
    recommendedVaccines: vaccines,
    dietPlan: {
      summary: health.food?.[0]?.name
        ? `Régime adapté ${petType} — ${health.food[0].name}`
        : `Alimentation équilibrée pour ${petType}`,
      mealsPerDay: petType === 'cat' ? '2-3' : '2',
      recommendedFoods: (health.food || []).slice(0, 3).map((f) => f.name),
      foodsToAvoid: ['Restes gras', 'Chocolat', 'Oignons'],
      supplements: (health.accessories || []).slice(0, 2).map((a) => a.name),
    },
    clinicalNotes:
      'Analyse générée sans IA cloud (mode règles). Confirmer par examen physique complet.',
    urgency: anomalies.some((a) => a.severity === 'high') ? 'soon' : 'routine',
    urgencyClass: anomalies.some((a) => a.severity === 'high') ? 'urgent' : 'non_urgent',
    diseaseSuspected: anomalies.some((a) => a.severity !== 'low'),
    healthFollowUp: {
      nextVisitDays: 7,
      monitoring: ['Appétit', 'Hydratation', 'Comportement'],
      warningSigns: ['Vomissements répétés', 'Léthargie', 'Refus de boire'],
    },
    followUpDays: 7,
    aiPowered: false,
  };
};

const analyzePetAnomalies = async ({ ownerId, petId, petName, animalType, symptoms, vitals, vetId }) => {
  if (isDemoMode()) {
    return {
      profile: {
        pet: { name: petName || 'Mimi', type: 'cat', ageYears: 3, weightKg: 4.2 },
        owner: { name: 'Client Test', email: 'client@petfood.tn' },
      },
      anomalies: [
        { label: 'Perte d\'appétit modérée', severity: 'medium', description: '3 jours, sans vomissement.' },
        { label: 'Pelage terne', severity: 'low', description: 'Possible carence ou parasitisme.' },
      ],
      diagnosticHypotheses: [
        { condition: 'Gastrite légère / stress', confidence: 'medium', rationale: 'Contexte digestif + changement alimentaire récent.' },
        { condition: 'Parasites externes', confidence: 'low', rationale: 'Grattements occasionnels.' },
      ],
      recommendedMedications: [
        { name: 'Oméprazole', dosage: '5 mg', frequency: '2×/jour', duration: '5 jours', notes: 'À jeun si possible' },
        { name: 'Probiotiques FortiFlora', dosage: '1 sachet', frequency: '1×/jour', duration: '10 jours', notes: '' },
      ],
      recommendedVaccines: [
        { name: 'Rappel Coryza', schedule: 'Dans 2 semaines', reason: 'Vaccin expiré dans l\'historique' },
      ],
      dietPlan: {
        summary: 'Régime digestif doux chat adulte',
        mealsPerDay: '3 petites portions',
        recommendedFoods: ['Pâtée hypoallergénique', 'Croquettes sensibles chat'],
        foodsToAvoid: ['Lait', 'Restes épicés'],
        supplements: ['Oméga-3'],
      },
      clinicalNotes: 'Surveiller hydratation 48 h. Reconsulter si vomissements ou léthargie.',
      urgency: 'soon',
      urgencyClass: 'urgent',
      diseaseSuspected: true,
      healthFollowUp: {
        nextVisitDays: 5,
        monitoring: ['Hydratation', 'Appétit', 'Selles'],
        warningSigns: ['Vomissements', 'Léthargie', 'Gêne respiratoire'],
      },
      followUpDays: 5,
      aiPowered: true,
    };
  }

  const profile = await buildPetProfile({ ownerId, petId, petName, animalType });

  const catalogMeds = await prisma.vetMedication.findMany({
    take: 15,
    orderBy: { stockQty: 'desc' },
    select: { name: true, unit: true, stockQty: true },
  });

  const payload = {
    petProfile: profile,
    symptoms: symptoms || '',
    vitals: vitals || {},
    vetId,
    pharmacyCatalog: catalogMeds.map((m) => m.name),
  };

  const userPrompt = `Analyse ce patient vétérinaire et détecte les anomalies.
Symptômes / signes observés : ${symptoms || 'Non précisés'}
Signes vitaux : ${JSON.stringify(vitals || {})}
Données patient :
${JSON.stringify(payload.petProfile, null, 2)}
Médicaments disponibles en pharmacie clinique : ${catalogMeds.map((m) => m.name).join(', ') || 'catalogue standard'}
Privilégie les médicaments du catalogue quand pertinent.`;

  const groqRaw = await completionWithSystem(ANALYSIS_SYSTEM, userPrompt, {
    temperature: 0.25,
    max_tokens: 1800,
  });

  let analysis = groqRaw ? parseJsonFromText(groqRaw) : null;

  if (!analysis || !analysis.anomalies) {
    analysis = await ruleBasedAnalysis(profile, symptoms);
  } else {
    analysis.aiPowered = true;
  }

  return {
    profile,
    ...analysis,
    disclaimer:
      'Suggestion IA — ne remplace pas l\'examen clinique ni la décision du vétérinaire.',
  };
};

module.exports = {
  buildPetProfile,
  analyzePetAnomalies,
};
