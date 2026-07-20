const express = require('express');
const { auth, vetAuth } = require('../middleware/auth');
const { vetAiChat, analyzePet } = require('../controllers/vetAi.controller');
const {
  getDashboard,
  getAppointments,
  getUnassignedAppointments,
  claimAppointment,
  confirmAppointment,
  startTeleconsult,
  updateAppointment,
  getConsultations,
  createConsultation,
  updateConsultation,
  getPrescriptions,
  createPrescription,
  updatePrescription,
  getClients,
  getHistory,
  getContactRequests,
  respondContactRequest,
} = require('../controllers/vet.controller');

const router = express.Router();

router.post('/ai/chat', auth, vetAuth, vetAiChat);
router.post('/ai/analyze-pet', auth, vetAuth, analyzePet);

const {
  listVetDossiers,
  getDossier,
  createDossier,
  patchDossier,
  createEntry,
  patchEntry,
  signEntryHandler,
  verifySignature,
  archiveConsultation,
  listVaccines,
} = require('../controllers/medicalDossier.controller');

const { getProfile, updateProfile, getStats } = require('../controllers/clinic.controller');
const {
  getMyAvailability,
  updateMyAvailability,
  previewSlots,
} = require('../controllers/vetAvailability.controller');

router.get('/availability', auth, vetAuth, getMyAvailability);
router.put('/availability', auth, vetAuth, updateMyAvailability);
router.get('/availability/preview', auth, vetAuth, previewSlots);

router.get('/clinic', auth, vetAuth, getProfile);
router.patch('/clinic', auth, vetAuth, updateProfile);
router.get('/clinic/stats', auth, vetAuth, getStats);

router.get('/vaccinations', auth, vetAuth, listVaccines);
router.post('/consultations/:consultationId/archive-dossier', auth, vetAuth, archiveConsultation);

router.get('/medical-dossiers', auth, vetAuth, listVetDossiers);
router.post('/medical-dossiers', auth, vetAuth, createDossier);
router.get('/medical-dossiers/:id', auth, vetAuth, getDossier);
router.patch('/medical-dossiers/:id', auth, vetAuth, patchDossier);
router.post('/medical-dossiers/:id/entries', auth, vetAuth, createEntry);
router.patch('/medical-dossiers/entries/:entryId', auth, vetAuth, patchEntry);
router.post('/medical-dossiers/entries/:entryId/sign', auth, vetAuth, signEntryHandler);
router.get('/medical-dossiers/entries/:entryId/verify', auth, vetAuth, verifySignature);

router.get('/dashboard', auth, vetAuth, getDashboard);
router.get('/appointments/unassigned', auth, vetAuth, getUnassignedAppointments);
router.get('/appointments', auth, vetAuth, getAppointments);
router.put('/appointments/:id/claim', auth, vetAuth, claimAppointment);
router.put('/appointments/:id/confirm', auth, vetAuth, confirmAppointment);
router.post('/appointments/:id/teleconsult/start', auth, vetAuth, startTeleconsult);
router.put('/appointments/:id', auth, vetAuth, updateAppointment);

router.get('/consultations', auth, vetAuth, getConsultations);
router.post('/consultations', auth, vetAuth, createConsultation);
router.put('/consultations/:id', auth, vetAuth, updateConsultation);

router.get('/prescriptions', auth, vetAuth, getPrescriptions);
router.post('/prescriptions', auth, vetAuth, createPrescription);
router.put('/prescriptions/:id', auth, vetAuth, updatePrescription);

router.get('/clients', auth, vetAuth, getClients);
router.get('/history', auth, vetAuth, getHistory);

const {
  getClinicalReport,
  getNutritionRecommendation,
} = require('../controllers/vetClinical.controller');
router.get('/clinical-report', auth, vetAuth, getClinicalReport);
router.get('/nutrition-recommendation', auth, vetAuth, getNutritionRecommendation);

router.get('/contact-requests', auth, vetAuth, getContactRequests);
router.put('/contact-requests/:id/respond', auth, vetAuth, respondContactRequest);

const { getBiDashboard, importClinicalData, importPharmacyStock, getPharmacies } = require('../controllers/vetBi.controller');
router.get('/bi/dashboard', auth, vetAuth, getBiDashboard);
router.post('/bi/import', auth, vetAuth, importClinicalData);
router.post('/bi/pharmacy-import', auth, vetAuth, importPharmacyStock);
router.get('/bi/pharmacies', auth, vetAuth, getPharmacies);

const {
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
} = require('../controllers/pharmacy.controller');

router.get('/pharmacy/medications', auth, vetAuth, listMedications);
router.post('/pharmacy/medications', auth, vetAuth, createMedicationHandler);
router.patch('/pharmacy/medications/:id/adjust', auth, vetAuth, adjustStockHandler);
router.patch('/pharmacy/medications/:id/thresholds', auth, vetAuth, updateThresholdsHandler);
router.get('/pharmacy/movements', auth, vetAuth, listMovements);
router.get('/pharmacy/suggest', auth, vetAuth, suggestTreatment);
router.post('/pharmacy/calculate-dose', auth, vetAuth, computeDose);
router.get('/pharmacy/stock-alerts', auth, vetAuth, stockAlerts);
router.get('/clinical/patient-context', auth, vetAuth, patientContext);
router.get('/clinical/timeline', auth, vetAuth, petTimeline);
router.get('/clinical/alerts', auth, vetAuth, clinicalAlerts);

const {
  postAnimalDetect,
  postAnimalDetectImage,
  getSpeciesProfiles,
  getRecentDetections,
  postPrescriptionAssist,
  postRefinePrescription,
  postApplyPrescriptionDraft,
  postDiagnosticAssist,
} = require('../controllers/vetMlAssist.controller');

router.get('/ml/species-profiles', auth, vetAuth, getSpeciesProfiles);
router.get('/ml/animal-detections', auth, vetAuth, getRecentDetections);
router.post('/ml/animal-detect', auth, vetAuth, postAnimalDetect);
router.post('/ml/animal-detect-image', auth, vetAuth, postAnimalDetectImage);
router.post('/ml/prescription-assist', auth, vetAuth, postPrescriptionAssist);
router.post('/ml/prescription-assist/:id/refine', auth, vetAuth, postRefinePrescription);
router.post('/ml/prescription-drafts/:id/apply', auth, vetAuth, postApplyPrescriptionDraft);
router.post('/ml/diagnostic-assist', auth, vetAuth, postDiagnosticAssist);

const healthProducts = require('../controllers/vetHealthProducts.controller');
router.get('/health-products/subtypes', auth, vetAuth, healthProducts.listSubtypes);
router.get('/health-products/vendors', auth, vetAuth, healthProducts.listVendors);
router.get('/health-products', auth, vetAuth, healthProducts.listMine);
router.post('/health-products', auth, vetAuth, healthProducts.publish);

module.exports = router;
