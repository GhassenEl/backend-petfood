const express = require('express');
const { auth, adminAuth } = require('../middleware/auth');
const {
  list,
  mine,
  getOne,
  lookupTag,
  create,
  patch,
  matches,
  markReunited,
} = require('../controllers/foundMe.controller');

const router = express.Router();

router.get('/lookup/:tagCode', lookupTag);
router.get('/', auth, list);
router.get('/mine', auth, mine);
router.get('/:id/matches', auth, matches);
router.get('/:id', auth, getOne);
router.post('/', auth, create);
router.patch('/:id', auth, patch);
router.post('/:id/reunited', auth, markReunited);

module.exports = router;
