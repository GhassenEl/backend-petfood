const express = require('express');
const { auth, adminAuth } = require('../middleware/auth');
const {
  getMyInvoices,
  payInvoice,
  getAllInvoices
} = require('../controllers/invoice.controller');

const router = express.Router();

// Client
router.get('/', auth, getMyInvoices);
router.post('/:id/pay', auth, payInvoice);

// Admin
router.get('/all', auth, adminAuth, getAllInvoices);

module.exports = router;
