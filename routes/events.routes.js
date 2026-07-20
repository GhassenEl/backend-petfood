const express = require('express');
const { auth } = require('../middleware/auth');
const {
  listEvents,
  createEvent,
  updateEvent,
  deleteEvent,
  registerForEvent,
  getMyPrizes,
} = require('../controllers/platformEvents.controller');

const router = express.Router();

router.get('/', auth, listEvents);
router.get('/my-prizes', auth, getMyPrizes);
router.get('/birthday/suggestions', auth, require('../controllers/birthdayEvent.controller').getBirthdaySuggestions);
router.post('/birthday/reserve', auth, require('../controllers/birthdayEvent.controller').postBirthdayReserve);
router.post('/', auth, createEvent);
router.put('/:id', auth, updateEvent);
router.delete('/:id', auth, deleteEvent);
router.post('/:id/register', auth, registerForEvent);

module.exports = router;
