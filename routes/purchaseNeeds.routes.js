const express = require('express');
const { auth, vendorAuth } = require('../middleware/auth');
const {
  list,
  mine,
  getOne,
  create,
  patch,
  respond,
  responses,
  patchResponse,
} = require('../controllers/purchaseNeed.controller');

const router = express.Router();

router.get('/', auth, list);
router.get('/mine', auth, mine);
router.get('/:id/responses', auth, responses);
router.get('/:id', auth, getOne);
router.post('/', auth, create);
router.patch('/:id', auth, patch);
router.post('/:id/responses', auth, vendorAuth, respond);
router.patch('/:id/responses/:responseId', auth, patchResponse);

module.exports = router;
