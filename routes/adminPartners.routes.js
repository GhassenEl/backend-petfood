const express = require('express');
const { auth, adminAuth } = require('../middleware/auth');
const c = require('../controllers/adminPartners.controller');

const router = express.Router();

router.get('/overview', auth, adminAuth, c.getOverview);
router.get('/suppliers', auth, adminAuth, c.getSupplySuppliers);
router.post('/suppliers', auth, adminAuth, c.postSupplySupplier);
router.patch('/suppliers/:id', auth, adminAuth, c.patchSupplySupplier);
router.post('/shelters', auth, adminAuth, c.postShelter);
router.post('/relay-points', auth, adminAuth, c.postRelayPoint);

module.exports = router;
