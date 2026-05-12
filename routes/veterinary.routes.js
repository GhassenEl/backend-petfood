const express = require('express');
const { auth, adminAuth } = require('../middleware/auth');
const {
  getRecords,
  getRecord,
  createRecord,
  updateRecord,
  deleteRecord,
  getUpcomingVisits
} = require('../controllers/veterinary.controller');

const router = express.Router();

// Authenticated
router.get('/', auth, getRecords);
router.get('/upcoming/all', auth, getUpcomingVisits);
router.get('/:id', auth, getRecord);

// Admin only
router.post('/', auth, adminAuth, createRecord);
router.put('/:id', auth, adminAuth, updateRecord);
router.delete('/:id', auth, adminAuth, deleteRecord);

module.exports = router;
