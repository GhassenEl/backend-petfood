const { chatWithGroq } = require('../services/groq.service');
const { analyzePetAnomalies } = require('../services/vetPetDiagnosis.service');

const vetAiChat = async (req, res) => {
  try {
    const { message, context } = req.body || {};
    if (!message || !String(message).trim()) {
      return res.status(400).json({ error: 'Message requis' });
    }

    const reply = await chatWithGroq(String(message).trim(), context || {});

    return res.json({
      message: reply,
      content: reply,
      quickReplies: ['Analyse symptômes', 'Protocole vaccin', 'Posologie', 'Urgence'],
      products: [],
    });
  } catch (err) {
    console.error('vetAiChat error:', err);
    return res.status(500).json({
      message: 'Assistant indisponible. Réessayez dans un instant.',
      content: 'Assistant indisponible. Réessayez dans un instant.',
      quickReplies: ['Réessayer'],
      products: [],
    });
  }
};

const analyzePet = async (req, res) => {
  try {
    const { ownerId, petId, petName, animalType, symptoms, vitals } = req.body || {};
    if (!symptoms || !String(symptoms).trim()) {
      return res.status(400).json({ error: 'Décrivez les symptômes ou anomalies observées' });
    }
    if (!ownerId && !petName) {
      return res.status(400).json({ error: 'Sélectionnez un animal ou renseignez son nom' });
    }

    const vetId = req.user?.id || req.user?._id;
    const result = await analyzePetAnomalies({
      ownerId,
      petId,
      petName,
      animalType,
      symptoms: String(symptoms).trim(),
      vitals: vitals || {},
      vetId,
    });

    return res.json(result);
  } catch (err) {
    console.error('analyzePet error:', err);
    return res.status(500).json({ error: err.message || 'Erreur analyse IA' });
  }
};

module.exports = { vetAiChat, analyzePet };
