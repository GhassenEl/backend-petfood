const express = require('express');
const { auth } = require('../middleware/auth');
const {
  getUserPets,
  addPet,
  updatePet,
  deletePet
} = require('../controllers/user.controller');
const {
  getVaccines,
  createVaccine,
  getAppointments,
  createAppointment
} = require('../controllers/veterinary.controller');

const router = express.Router();

// Pets
router.get('/', auth, getUserPets);
router.post('/', auth, addPet);
router.put('/:petId', auth, updatePet);
router.delete('/:petId', auth, deletePet);

// Vaccines
router.get('/vaccines', auth, getVaccines);
router.post('/vaccines', auth, createVaccine);
router.get('/vaccine-reminders', auth, require('../controllers/vaccineReminder.controller').getReminders);

// Appointments
router.get('/appointments', auth, getAppointments);
router.post('/appointments', auth, createAppointment);

module.exports = router;
