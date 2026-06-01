const express = require('express');
const { auth } = require('../middleware/auth');
const {
  listEvents,
  createEvent,
  updateEvent,
  deleteEvent,
} = require('../controllers/platformEvents.controller');

const router = express.Router();

router.get('/', auth, listEvents);
router.post('/', auth, createEvent);
router.put('/:id', auth, updateEvent);
router.delete('/:id', auth, deleteEvent);

module.exports = router;
