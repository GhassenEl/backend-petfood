const {
  getClinicalMlAgentPack,
  runClinicalAnalysis,
  getPatientClinicalContext,
  applyAnalysisToDossier,
  applyAnalysisPrescription,
} = require('../services/vetClinicalMlAgent.service');
const { isDemoMode } = require('../prismaClient');
const demoStore = require('../utils/demoStore');

const resolveUser = (req) =>
  isDemoMode() ? demoStore.getUserById(req.user.id || req.user._id) || req.user : req.user;

const handleError = (res, error, code = 500) => {
  console.error('Vet clinical ML error:', error);
  res.status(error.status || code).json({ error: error.message || 'Erreur agent clinique' });
};

const getAgentPack = async (req, res) => {
  try {
    const pack = await getClinicalMlAgentPack(resolveUser(req));
    res.json(pack);
  } catch (error) {
    handleError(res, error);
  }
};

const postAnalyze = async (req, res) => {
  try {
    const result = await runClinicalAnalysis(resolveUser(req), req.body || {});
    res.json(result);
  } catch (error) {
    handleError(res, error, error.status || 500);
  }
};

const getPatientContext = async (req, res) => {
  try {
    const { ownerId, petName, petId } = req.query;
    const ctx = await getPatientClinicalContext(resolveUser(req), { ownerId, petName, petId });
    res.json(ctx);
  } catch (error) {
    handleError(res, error);
  }
};

const postApplyDossier = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await applyAnalysisToDossier(resolveUser(req), id);
    res.json(result);
  } catch (error) {
    handleError(res, error, error.status || 500);
  }
};

const postApplyPrescription = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await applyAnalysisPrescription(resolveUser(req), id);
    res.json(result);
  } catch (error) {
    handleError(res, error, error.status || 500);
  }
};

module.exports = {
  getAgentPack,
  postAnalyze,
  getPatientContext,
  postApplyDossier,
  postApplyPrescription,
};
