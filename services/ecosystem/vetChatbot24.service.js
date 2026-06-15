const { completionWithSystem } = require('../groq.service');
const { predictClinicalUrgency } = require('../../ml/clinicalUrgencyModel');

const VET_CHATBOT_SYSTEM = `Tu es le chatbot vétérinaire PetfoodTN, disponible 24h/24 pour les propriétaires en Tunisie.
Règles strictes :
- Réponds en français, clair et rassurant.
- Donne des conseils généraux (nutrition, prévention, comportement) — PAS de diagnostic définitif.
- Si symptômes graves (convulsions, sang, détresse respiratoire, intoxication), dis d'appeler un vétérinaire ou les urgences immédiatement.
- Propose l'orientation vers /veterinary pour prise de RDV quand pertinent.
- Max 4 paragraphes courts.`;

const FAQ = [
  { q: /vaccin|vaccination/i, a: 'Le calendrier vaccinal dépend de l’espèce et de l’âge. Consultez votre vétérinaire pour un protocole à jour (CHPPiL, rage, etc.).' },
  { q: /nourriture|croquette|alimentation/i, a: 'Choisissez une alimentation adaptée à l’âge, la taille et l’activité. NutriPro sur PetfoodTN peut générer un plan personnalisé.' },
  { q: /vomit|diarrhée/i, a: 'Coupez la nourriture 12–24 h, eau en petites quantités. Si vomissements répétés, sang ou léthargie → vétérinaire sous 24 h.' },
];

const matchFaq = (message) => {
  for (const f of FAQ) {
    if (f.q.test(message)) return f.a;
  }
  return null;
};

const chatVet24 = async (user, { message, petType = 'dog', petName, symptoms }) => {
  const text = String(message || symptoms || '').trim();
  if (!text) {
    const err = new Error('Message requis');
    err.status = 400;
    throw err;
  }

  const ml = predictClinicalUrgency({
    symptoms: text,
    vitals: {},
    profile: { pet: { type: petType, name: petName || 'Animal' } },
  });

  const faq = matchFaq(text);
  let reply = faq;
  let groqPowered = false;

  if (process.env.GROQ_API_KEY) {
    const groq = await completionWithSystem(
      VET_CHATBOT_SYSTEM,
      `Client: ${user?.name || 'Propriétaire'}\nAnimal: ${petName || '?'} (${petType})\nMessage: ${text}\nScore urgence ML: ${ml.urgencyClass}`,
      { max_tokens: 600, temperature: 0.3 }
    );
    if (groq) {
      reply = groq;
      groqPowered = true;
    }
  }

  if (!reply) {
    reply =
      'Merci pour votre message. Pour une réponse fiable, décrivez les symptômes (durée, appétit, comportement). En cas d’urgence, contactez un vétérinaire. Rendez-vous en ligne : section Vétérinaire.';
  }

  const referToVet = ml.urgencyClass === 'urgent' || ml.diseaseSuspected;

  return {
    reply,
    groqPowered,
    mlModel: ml.modelId,
    urgency: ml.urgency,
    urgencyClass: ml.urgencyClass,
    referToVet,
    referUrl: referToVet ? '/veterinary' : null,
    disclaimer: 'Ce chatbot ne remplace pas un examen clinique.',
  };
};

module.exports = { chatVet24, VET_CHATBOT_SYSTEM };
