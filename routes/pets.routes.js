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
router.put('/:petIndex', auth, updatePet);
router.delete('/:petIndex', auth, deletePet);

// Vaccines
router.get('/vaccines', auth, getVaccines);
router.post('/vaccines', auth, createVaccine);

// Appointments
router.get('/appointments', auth, getAppointments);
router.post('/appointments', auth, createAppointment);

module.exports = router;
