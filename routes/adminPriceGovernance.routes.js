const express = require('express');
const { auth, adminAuth } = require('../middleware/auth');
const c = require('../controllers/adminPriceGovernance.controller');

const router = express.Router();

router.get('/pack', auth, adminAuth, c.getPack);
router.get('/policy', auth, adminAuth, c.getPolicy);
router.patch('/policy', auth, adminAuth, c.patchPolicy);
router.patch('/products/:productId', auth, adminAuth, c.patchProductPrice);
router.post('/pending/:id/approve', auth, adminAuth, c.approvePending);
router.post('/pending/:id/reject', auth, adminAuth, c.rejectPending);
router.post('/bulk-update', auth, adminAuth, c.bulkUpdate);
router.post('/verify-all', auth, adminAuth, c.verifyAll);
router.get('/export', auth, adminAuth, c.exportPrices);
router.post('/import', auth, adminAuth, c.importPrices);

module.exports = router;
