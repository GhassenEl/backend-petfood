const { prisma, isDemoMode } = require('../../prismaClient');
const { completionWithSystem } = require('../groq.service');

const uid = (u) => String(u?.id || u?._id);

const EMOTION_KEYS = ['stress', 'fatigue', 'joy', 'aggressiveness'];

const clamp01 = (n) => Math.max(0, Math.min(1, Math.round(n * 1000) / 1000));

const heuristicEmotions = (hint = '') => {
  const h = hint.toLowerCase();
  const scores = { stress: 0.15, fatigue: 0.2, joy: 0.45, aggressiveness: 0.08 };

  if (/stress|anxieux|peur|trembl|panique|craint|stressé/.test(h)) scores.stress += 0.45;
  if (/fatigu|létharg|somnol|épuis|dort|sleep|lass/.test(h)) scores.fatigue += 0.4;
  if (/joyeu|content|joue|queue|heureux|excit|calme|détendu/.test(h)) scores.joy += 0.4;
  if (/agress|grogn|mord|griff|poil.*hériss|feule|charge/.test(h)) scores.aggressiveness += 0.5;
  if (/calme|serein|relax/.test(h)) {
    scores.stress = Math.max(0, scores.stress - 0.2);
    scores.joy += 0.15;
  }

  EMOTION_KEYS.forEach((k) => { scores[k] = clamp01(scores[k]); });
  const dominant = EMOTION_KEYS.reduce((a, b) => (scores[a] >= scores[b] ? a : b));
  const labels = {
    stress: 'Stress',
    fatigue: 'Fatigue',
    joy: 'Joie',
    aggressiveness: 'Agressivité',
  };

  return {
    emotions: scores,
    dominant,
    dominantLabel: labels[dominant],
    confidence: 0.68,
    behaviorNotes: buildNotes(scores, h),
    model: 'emotion_video_heuristic_v1',
    mediaType: /vidéo|video|film/.test(h) ? 'video' : 'image',
  };
};

const buildNotes = (scores, hint) => {
  const parts = [];
  if (scores.stress > 0.5) parts.push('Signes de stress — environnement calme conseillé');
  if (scores.fatigue > 0.5) parts.push('Fatigue possible — surveiller sommeil et hydratation');
  if (scores.joy > 0.55) parts.push('Comportement globalement positif');
  if (scores.aggressiveness > 0.45) parts.push('Agressivité détectée — éviter sollicitations brusques');
  if (!parts.length) parts.push('Profil émotionnel équilibré sur la description fournie');
  if (hint.length < 12) parts.push('Ajoutez une description vidéo/comportement pour affiner l’analyse');
  return parts.join('. ');
};

const analyzeEmotions = async (user, { petName, videoHint, behaviorHint, imageBase64 } = {}) => {
  const userId = uid(user);
  const hint = [videoHint, behaviorHint].filter(Boolean).join(' — ') || '';

  let results = heuristicEmotions(hint);

  if (process.env.GROQ_API_KEY && hint.length > 8) {
    try {
      const raw = await completionWithSystem(
        `Tu es ethologue PetfoodTN. JSON uniquement:
{"emotions":{"stress":0,"fatigue":0,"joy":0,"aggressiveness":0},"dominant":"stress|fatigue|joy|aggressiveness","behaviorNotes":"","confidence":0.5}
Scores entre 0 et 1, somme proche de 1.`,
        `Analyse visage/comportement animal (vidéo ou photo décrite): ${hint}`,
        { max_tokens: 400, temperature: 0.2 },
      );
      const m = raw?.match(/\{[\s\S]*\}/);
      if (m) {
        const parsed = JSON.parse(m[0]);
        if (parsed.emotions) {
          EMOTION_KEYS.forEach((k) => {
            if (parsed.emotions[k] != null) results.emotions[k] = clamp01(Number(parsed.emotions[k]));
          });
          results.dominant = parsed.dominant || results.dominant;
          results.dominantLabel = {
            stress: 'Stress',
            fatigue: 'Fatigue',
            joy: 'Joie',
            aggressiveness: 'Agressivité',
          }[results.dominant] || results.dominantLabel;
          results.behaviorNotes = parsed.behaviorNotes || results.behaviorNotes;
          results.confidence = clamp01(parsed.confidence ?? 0.75);
          results.model = 'groq_emotion_v1';
        }
      }
    } catch {
      /* heuristique */
    }
  }

  results.disclaimer =
    'Estimation indicative (vision comportementale) — ne remplace pas un comportementaliste ou vétérinaire.';

  if (isDemoMode()) {
    return { id: `emo_${Date.now()}`, petName, results };
  }

  const row = await prisma.emotionAnalysis.create({
    data: {
      userId,
      petName: petName || null,
      mediaHint: hint.slice(0, 2000) || (imageBase64 ? 'upload' : null),
      resultsJson: JSON.stringify(results),
    },
  });

  return { id: row.id, petName, results, createdAt: row.createdAt };
};

const history = async (user) => {
  const userId = uid(user);
  if (isDemoMode()) return { analyses: [] };
  const rows = await prisma.emotionAnalysis.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: 12,
  });
  return {
    analyses: rows.map((r) => ({
      id: r.id,
      petName: r.petName,
      results: JSON.parse(r.resultsJson || '{}'),
      createdAt: r.createdAt,
    })),
  };
};

module.exports = { analyzeEmotions, history, heuristicEmotions };
