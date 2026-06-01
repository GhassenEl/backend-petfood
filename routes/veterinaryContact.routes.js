const express = require('express');
const { auth, adminAuth, vetAuth } = require('../middleware/auth');
const {
  getContactRequests,
  submitContactRequest,
  respondToContactRequest,
} = require('../controllers/veterinaryContact.controller');
const {
  getMyPrescriptions,
  getMyConsultations,
} = require('../controllers/clientVeterinary.controller');

const router = express.Router();

router.get('/my/prescriptions', auth, getMyPrescriptions);
router.get('/my/consultations', auth, getMyConsultations);
router.get('/contact/requests', auth, getContactRequests);
router.post('/contact', auth, submitContactRequest);
router.put('/contact/:id/respond', auth, vetAuth, respondToContactRequest);

module.exports = router;

