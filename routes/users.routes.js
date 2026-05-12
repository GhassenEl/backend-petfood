const express = require('express');
const { auth, adminAuth } = require('../middleware/auth');
const {
  getProfile,
  updateProfile,
  getAllUsers,
  createUser,
  updateUser,
  deleteUser,
  getUserCount,
  getStoreLocations
} = require('../controllers/user.controller');

const router = express.Router();

// Profile (client & admin)
router.get('/profile', auth, getProfile);
router.put('/profile', auth, updateProfile);

// Admin CRUD
router.get('/', auth, adminAuth, getAllUsers);
router.post('/', auth, adminAuth, createUser);
router.put('/:id', auth, adminAuth, updateUser);
router.delete('/:id', auth, adminAuth, deleteUser);
router.get('/count', auth, adminAuth, getUserCount);

// Public store locations
router.get('/store-locations', getStoreLocations);

module.exports = router;
