const express = require('express');
const { auth, adminAuth } = require('../middleware/auth');
const { threatScanMiddleware } = require('../middleware/threatScan.middleware');
const {
  getMyComplaints,
  createComplaint,
  getComplaintCount,
  createAdminComplaint,
  getAllComplaints,
  updateComplaint,
  deleteComplaint
} = require('../controllers/complaint.controller');

const router = express.Router();

// Client
router.get('/', auth, getMyComplaints);
router.post('/', auth, threatScanMiddleware({ source: 'complaint_create' }), createComplaint);

// Admin
router.get('/count', auth, adminAuth, getComplaintCount);
router.post('/admin', auth, adminAuth, createAdminComplaint);
router.get('/all', auth, adminAuth, getAllComplaints);
router.put('/:id', auth, adminAuth, updateComplaint);
router.delete('/:id', auth, deleteComplaint);

module.exports = router;
