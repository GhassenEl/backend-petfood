const express = require('express');
const { auth, adminAuth, vetAuth } = require('../middleware/auth');
const {
  getRecords,
  getRecord,
  createRecord,
  updateRecord,
  deleteRecord,
  getUpcomingVisits,
  getNearbyVets,
} = require('../controllers/veterinary.controller');
const {
  listClientDossiers,
  getDossier,
  verifySignature,
} = require('../controllers/medicalDossier.controller');

const router = express.Router();

// Authenticated
router.get('/nearby', auth, getNearbyVets);
router.get('/my/dossiers', auth, listClientDossiers);
router.get('/my/dossiers/:id', auth, getDossier);
router.get('/my/dossiers/entries/:entryId/verify', auth, verifySignature);
router.get('/', auth, getRecords);
router.get('/upcoming/all', auth, getUpcomingVisits);
router.get('/:id', auth, getRecord);

// Admin only
router.post('/', auth, vetAuth, createRecord);
router.put('/:id', auth, vetAuth, updateRecord);
router.delete('/:id', auth, vetAuth, deleteRecord);

module.exports = router;
