const express = require('express');
const { auth, adminAuth } = require('../middleware/auth');
const {
  getMyInvoices,
  payInvoice,
  getAllInvoices,
  createInvoice,
  updateInvoice,
  deleteInvoice
} = require('../controllers/invoice.controller');

const router = express.Router();

// Client
router.get('/', auth, getMyInvoices);
router.post('/:id/pay', auth, payInvoice);

// Admin
router.get('/all', auth, adminAuth, getAllInvoices);
router.post('/', auth, adminAuth, createInvoice);
router.put('/:id', auth, adminAuth, updateInvoice);
router.delete('/:id', auth, adminAuth, deleteInvoice);

module.exports = router;
