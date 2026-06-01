const {
  getMedicationCatalog,
  suggestByDiagnosis,
  calculateDose,
  getLowStockAlerts,
} = require('../services/pharmacy.service');
const { getPatientContext, getPetTimeline, getVetClinicalAlerts } = require('../services/clinicalAlerts.service');

const listMedications = async (req, res) => {
  try {
    const catalog = await getMedicationCatalog();
    return res.json(catalog);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

const suggestTreatment = async (req, res) => {
  try {
    const { diagnosis, animalType } = req.query;
    const suggestions = await suggestByDiagnosis(diagnosis, animalType);
    return res.json(suggestions);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

const computeDose = async (req, res) => {
  try {
    const result = calculateDose(req.body || {});
    if (result.error) return res.status(400).json({ error: result.error });
    return res.json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

const stockAlerts = async (req, res) => {
  try {
    const alerts = await getLowStockAlerts();
    return res.json(alerts);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

const patientContext = async (req, res) => {
  try {
    const { ownerId, petName } = req.query;
    const ctx = await getPatientContext(ownerId, petName);
    return res.json(ctx);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

const petTimeline = async (req, res) => {
  try {
    const { ownerId, petName } = req.query;
    const vetId = req.user?.role === 'vet' ? req.user.id || req.user._id : undefined;
    const timeline = await getPetTimeline({ ownerId, petName, vetId });
    return res.json(timeline);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

const clinicalAlerts = async (req, res) => {
  try {
    const vetId = req.user?.id || req.user?._id;
    const alerts = await getVetClinicalAlerts(vetId);
    return res.json(alerts);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

module.exports = {
  listMedications,
  suggestTreatment,
  computeDose,
  stockAlerts,
  patientContext,
  petTimeline,
  clinicalAlerts,
};
