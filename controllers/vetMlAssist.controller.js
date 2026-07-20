const { detectAnimal, listRecentDetections } = require('../services/vetAnimalDetection.service');
const {
  generatePrescriptionDraft,
  refinePrescriptionDraft,
  applyPrescriptionDraft,
  runDiagnosticAssist,
} = require('../services/vetPrescriptionAssist.service');
const { detectAnimalFromImage } = require('../services/vetImageDetection.service');
const { listActiveSpeciesProfiles } = require('../services/animalSpeciesProfile.service');
const { isDemoMode } = require('../prismaClient');
const demoStore = require('../utils/demoStore');

const resolveUser = (req) =>
  isDemoMode() ? demoStore.getUserById(req.user.id || req.user._id) || req.user : req.user;

const handleError = (res, error, code = 500) => {
  console.error('Vet ML assist error:', error);
  res.status(error.status || code).json({ error: error.message || 'Erreur agent ML vétérinaire' });
};

const postAnimalDetect = async (req, res) => {
  try {
    const result = await detectAnimal(resolveUser(req), req.body || {});
    res.json(result);
  } catch (error) {
    handleError(res, error, error.status || 500);
  }
};

const getSpeciesProfiles = async (req, res) => {
  try {
    const profiles = await listActiveSpeciesProfiles();
    res.json(profiles);
  } catch (error) {
    handleError(res, error);
  }
};

const getRecentDetections = async (req, res) => {
  try {
    const vetId = req.user?.id || req.user?._id;
    const recent = await listRecentDetections(vetId, Number(req.query.limit) || 10);
    res.json(recent);
  } catch (error) {
    handleError(res, error);
  }
};

const postPrescriptionAssist = async (req, res) => {
  try {
    const result = await generatePrescriptionDraft(resolveUser(req), req.body || {});
    res.json(result);
  } catch (error) {
    handleError(res, error, error.status || 500);
  }
};

const postRefinePrescription = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await refinePrescriptionDraft(resolveUser(req), id, req.body || {});
    res.json(result);
  } catch (error) {
    handleError(res, error, error.status || 500);
  }
};

const postApplyPrescriptionDraft = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await applyPrescriptionDraft(resolveUser(req), id);
    res.status(201).json(result);
  } catch (error) {
    handleError(res, error, error.status || 500);
  }
};

const postDiagnosticAssist = async (req, res) => {
  try {
    const result = await runDiagnosticAssist(resolveUser(req), req.body || {});
    res.json(result);
  } catch (error) {
    handleError(res, error, error.status || 500);
  }
};

const postAnimalDetectImage = async (req, res) => {
  try {
    const result = await detectAnimalFromImage(resolveUser(req), req.body || {});
    res.json(result);
  } catch (error) {
    handleError(res, error, error.status || 500);
  }
};

module.exports = {
  postAnimalDetect,
  postAnimalDetectImage,
  getSpeciesProfiles,
  getRecentDetections,
  postPrescriptionAssist,
  postRefinePrescription,
  postApplyPrescriptionDraft,
  postDiagnosticAssist,
};
