const { analyzeEarlyDiseaseRisk } = require('../services/earlyDiseaseDetection.service');
const { isDemoMode } = require('../prismaClient');
const demoStore = require('../utils/demoStore');

const resolveUser = (req) =>
  isDemoMode() ? demoStore.getUserById(req.user.id || req.user._id) || req.user : req.user;

const postEarlyDetection = async (req, res) => {
  try {
    const body = req.body || {};
    const result = await analyzeEarlyDiseaseRisk({
      ownerId: body.ownerId,
      petId: body.petId,
      petName: body.petName,
      animalType: body.animalType,
      symptoms: body.symptoms,
      vitals: body.vitals,
    });
    res.json(result);
  } catch (error) {
    console.error('Early detection error:', error);
    res.status(error.status || 500).json({ error: error.message || 'Analyse indisponible' });
  }
};

module.exports = { postEarlyDetection };
