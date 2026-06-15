const express = require('express');
const { auth, adminAuth } = require('../middleware/auth');
const c = require('../controllers/refund.controller');

const router = express.Router();

router.get('/', auth, adminAuth, c.getAdminRefunds);
router.get('/policy', auth, adminAuth, c.getPolicy);
router.patch('/policy', auth, adminAuth, c.patchPolicy);
router.post('/:id/force', auth, adminAuth, c.adminForce);
router.post('/:id/cancel', auth, adminAuth, c.adminCancel);

module.exports = router;
