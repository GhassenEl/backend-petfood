const express = require('express');
const { auth, vetAuth } = require('../middleware/auth');
const { vetAiChat, analyzePet } = require('../controllers/vetAi.controller');
const {
  getDashboard,
  getAppointments,
  getUnassignedAppointments,
  claimAppointment,
  confirmAppointment,
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
router.put('/appointments/:id', auth, vetAuth, updateAppointment);

router.get('/consultations', auth, vetAuth, getConsultations);
router.post('/consultations', auth, vetAuth, createConsultation);
router.put('/consultations/:id', auth, vetAuth, updateConsultation);

router.get('/prescriptions', auth, vetAuth, getPrescriptions);
router.post('/prescriptions', auth, vetAuth, createPrescription);
router.put('/prescriptions/:id', auth, vetAuth, updatePrescription);

router.get('/clients', auth, vetAuth, getClients);
router.get('/history', auth, vetAuth, getHistory);

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
} = require('../controllers/pharmacy.controller');

router.get('/pharmacy/medications', auth, vetAuth, listMedications);
router.get('/pharmacy/suggest', auth, vetAuth, suggestTreatment);
router.post('/pharmacy/calculate-dose', auth, vetAuth, computeDose);
router.get('/pharmacy/stock-alerts', auth, vetAuth, stockAlerts);
router.get('/clinical/patient-context', auth, vetAuth, patientContext);
router.get('/clinical/timeline', auth, vetAuth, petTimeline);
router.get('/clinical/alerts', auth, vetAuth, clinicalAlerts);

module.exports = router;
