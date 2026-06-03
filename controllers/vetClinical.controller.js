const { buildClinicalReport } = require('../services/vetClinicalReport.service');
const { buildNutritionRecommendation } = require('../services/vetNutrition.service');

const getClinicalReport = async (req, res) => {
  try {
    const { ownerId, petName } = req.query;
    const report = await buildClinicalReport(req, { ownerId, petName });
    res.json(report);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || 'Rapport indisponible' });
  }
};

const getNutritionRecommendation = async (req, res) => {
  try {
    const { ownerId, petName } = req.query;
    const data = await buildNutritionRecommendation({ ownerId, petName });
    res.json(data);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || 'Recommandation indisponible' });
  }
};

module.exports = {
  getClinicalReport,
  getNutritionRecommendation,
};
