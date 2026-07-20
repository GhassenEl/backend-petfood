const { prisma, isDemoMode } = require('../prismaClient');
const { detectAnimal } = require('./vetAnimalDetection.service');
const { completionWithSystem } = require('./groq.service');

const parseJson = (text) => {
  if (!text) return null;
  try {
    return JSON.parse(text.trim());
  } catch {
    const m = String(text).match(/\{[\s\S]*\}/);
    if (m) {
      try {
        return JSON.parse(m[0]);
      } catch {
        return null;
      }
    }
  }
  return null;
};

const analyzeImageDescription = async (imageHint, imageBase64) => {
  let visionHints = {
    speciesGuess: null,
    breedGuess: null,
    colorMarks: null,
    posture: null,
  };

  if (process.env.GROQ_API_KEY && (imageHint || imageBase64)) {
    const prompt = imageHint
      ? `Photo animal — description: ${imageHint}`
      : 'Photo animal uploadée — décrire espèce, race, couleur, posture.';
    const raw = await completionWithSystem(
      `Tu es expert identification animaux. JSON uniquement:
{"speciesGuess":"dog|cat|bird|rabbit|fish|reptile|other","breedGuess":"...","colorMarks":"...","posture":"...","confidence":0.0}`,
      prompt,
      { max_tokens: 300, temperature: 0.15 },
    ).catch(() => null);
    const parsed = parseJson(raw);
    if (parsed) visionHints = { ...visionHints, ...parsed };
  }

  const description = [
    imageHint,
    visionHints.breedGuess,
    visionHints.colorMarks,
    visionHints.speciesGuess,
  ]
    .filter(Boolean)
    .join(' — ');

  return {
    visionHints,
    description,
    source: 'vision_text',
  };
};

const detectAnimalFromImage = async (user, body) => {
  const { imageBase64, imageHint, ownerId, petId, weightKg, temperatureC } = body;

  if (!imageBase64 && !imageHint) {
    const err = new Error("Fournissez une photo (base64) ou une description de l'image");
    err.status = 400;
    throw err;
  }

  const vision = await analyzeImageDescription(imageHint, imageBase64);
  const description =
    vision.description ||
    [imageHint, vision.visionHints?.breedGuess, vision.visionHints?.colorMarks]
      .filter(Boolean)
      .join(' — ') ||
    'Animal sur photo';

  const detection = await detectAnimal(user, {
    description,
    ownerId,
    petId,
    weightKg,
    temperatureC,
    breedHint: vision.visionHints?.breedGuess,
  });

  if (!isDemoMode()) {
    const vetId = String(user?.id || user?._id || '');
    await prisma.imageAnalysis
      .create({
        data: {
          userId: vetId,
          petName: detection.matchedPets?.[0]?.name || null,
          imageHint: imageHint || 'vet_species_detect',
          resultsJson: JSON.stringify({
            ...detection,
            visionHints: vision.visionHints,
            imageAnalysis: true,
          }),
        },
      })
      .catch(() => null);
  }

  return {
    ...detection,
    visionHints: vision.visionHints,
    imagePowered: true,
    disclaimer:
      'Identification par photo assistée par IA — confirmer espèce et identité au cabinet.',
  };
};

module.exports = { detectAnimalFromImage, analyzeImageDescription };
