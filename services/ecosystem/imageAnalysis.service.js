const { prisma, isDemoMode } = require('../../prismaClient');
const { completionWithSystem } = require('../groq.service');

const uid = (u) => String(u?.id || u?._id);

const heuristicFromHint = (hint = '') => {
  const h = hint.toLowerCase();
  const results = {
    breed: { label: 'Croisé / indéterminé', confidence: 0.55 },
    ageEstimate: { years: null, label: 'Adulte estimé', confidence: 0.5 },
    overweight: { detected: false, score: 0.2, label: 'Corpulence normale' },
    coat: { status: 'ok', notes: 'Pelage sans anomalie évidente' },
    eyes: { status: 'ok', notes: 'Yeux clairs' },
    skin: { status: 'ok', notes: 'Peau sans rougeur visible' },
    model: 'image_heuristic_v1',
  };

  if (/berger|labrador|golden|husky|chihuahua|spitz|malinois/.test(h)) {
    results.breed = { label: h.match(/berger|labrador|golden|husky|chihuahua|spitz|malinois/)[0], confidence: 0.72 };
  }
  if (/chat|siames|persan|maine/.test(h)) {
    results.breed = { label: 'Chat — race estimée', confidence: 0.68 };
  }
  if (/chiot|chaton|junior|jeune/.test(h)) {
    results.ageEstimate = { years: 1, label: 'Jeune (< 2 ans)', confidence: 0.65 };
  }
  if (/senior|vieux|âgé|age/.test(h)) {
    results.ageEstimate = { years: 9, label: 'Senior (7+ ans)', confidence: 0.6 };
  }
  if (/gros|overweight|obese|surpoids|rondeur/.test(h)) {
    results.overweight = { detected: true, score: 0.78, label: 'Surpoids possible — ajuster ration' };
  }
  if (/pelage|poil|alopec|démange/.test(h)) {
    results.coat = { status: 'watch', notes: 'Surveiller pelage / démangeaisons' };
  }
  if (/oeil|yeux|rouge|larmoi/.test(h)) {
    results.eyes = { status: 'watch', notes: 'Irritation oculaire possible' };
  }
  if (/peau|bouton|rougeur/.test(h)) {
    results.skin = { status: 'watch', notes: 'Anomalie cutanée à confirmer' };
  }

  return results;
};

const analyzeImage = async (user, { petName, imageHint, imageBase64 }) => {
  const userId = uid(user);
  let results = heuristicFromHint(imageHint || '');

  if (process.env.GROQ_API_KEY && imageHint) {
    try {
      const raw = await completionWithSystem(
        `Tu es vétérinaire imagerie PetfoodTN. JSON uniquement:
{"breed":{"label":"","confidence":0},"ageEstimate":{"years":0,"label":"","confidence":0},"overweight":{"detected":false,"score":0,"label":""},"coat":{"status":"ok|watch","notes":""},"eyes":{"status":"ok|watch","notes":""},"skin":{"status":"ok|watch","notes":""}}`,
        `Analyse photo animal (description utilisateur): ${imageHint}`,
        { max_tokens: 500, temperature: 0.2 }
      );
      const m = raw?.match(/\{[\s\S]*\}/);
      if (m) {
        const parsed = JSON.parse(m[0]);
        results = { ...results, ...parsed, model: 'groq_vision_text_v1' };
      }
    } catch {
      /* garde heuristique */
    }
  }

  results.disclaimer =
    'Analyse indicative — ne remplace pas un examen vétérinaire. Consultez un praticien en cas de doute.';

  if (isDemoMode()) {
    return { id: `img_${Date.now()}`, petName, results };
  }

  const row = await prisma.imageAnalysis.create({
    data: {
      userId,
      petName: petName || null,
      imageHint: imageHint || (imageBase64 ? 'upload' : null),
      resultsJson: JSON.stringify(results),
    },
  });

  return { id: row.id, petName, results, createdAt: row.createdAt };
};

const history = async (user) => {
  const userId = uid(user);
  if (isDemoMode()) return { analyses: [] };
  const rows = await prisma.imageAnalysis.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: 15,
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

module.exports = { analyzeImage, history, heuristicFromHint };
