const {
  getMedicationCatalog,
  suggestByDiagnosis,
  calculateDose,
  getLowStockAlerts,
  createMedication,
  adjustMedicationStock,
  updateMedicationThresholds,
  getMedicationMovements,
} = require('../services/pharmacy.service');
const { getPatientContext, getPetTimeline, getVetClinicalAlerts } = require('../services/clinicalAlerts.service');
const { emitPlatformPulse } = require('../utils/platformPulse');

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

const createMedicationHandler = async (req, res) => {
  try {
    const userId = req.user?.id || req.user?._id;
    const medication = await createMedication(req.body || {}, userId);
    emitPlatformPulse('vet-pharmacy-create');
    return res.status(201).json(medication);
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message });
  }
};

const adjustStockHandler = async (req, res) => {
  try {
    const userId = req.user?.id || req.user?._id;
    const medication = await adjustMedicationStock(req.params.id, req.body || {}, userId);
    emitPlatformPulse('vet-pharmacy-adjust');
    return res.json(medication);
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message });
  }
};

const updateThresholdsHandler = async (req, res) => {
  try {
    const medication = await updateMedicationThresholds(req.params.id, req.body || {});
    emitPlatformPulse('vet-pharmacy-thresholds');
    return res.json(medication);
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message });
  }
};

const listMovements = async (req, res) => {
  try {
    const limit = Number(req.query.limit) || 30;
    const movements = await getMedicationMovements(limit);
    return res.json(movements);
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
  createMedicationHandler,
  adjustStockHandler,
  updateThresholdsHandler,
  listMovements,
};
