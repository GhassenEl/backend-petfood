const express = require('express');
const { auth, adminAuth } = require('../middleware/auth');
const {
  createRequest,
  getMine,
  getAll,
  review,
  cancel,
} = require('../controllers/leaveRequest.controller');

const router = express.Router();

const staffCreate = (req, res, next) => {
  const role = req.user?.role;
  if (role === 'vet' || role === 'livreur') return next();
  return res.status(403).json({ error: 'Rôle vétérinaire ou livreur requis' });
};

router.post('/', auth, staffCreate, createRequest);
router.get('/mine', auth, staffCreate, getMine);
router.delete('/:id', auth, staffCreate, cancel);

router.get('/', auth, adminAuth, getAll);
router.patch('/:id/review', auth, adminAuth, review);

module.exports = router;
