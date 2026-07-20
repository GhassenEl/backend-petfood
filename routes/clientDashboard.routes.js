const express = require('express');
const { auth } = require('../middleware/auth');
const c = require('../controllers/clientDashboard.controller');
const iot = require('../controllers/clientIot.controller');

const router = express.Router();

router.get('/dashboard', auth, c.getDashboard);
router.get('/iot/pack', auth, iot.getIoTPack);
router.get('/iot/wearables', auth, iot.getWearables);
router.post('/iot/wearables/:id/simulate', auth, iot.postWearableSimulate);
router.get('/family/household', auth, c.getHousehold);
router.post('/family/household', auth, c.postHousehold);
router.post('/family/join', auth, c.postJoinHousehold);
router.delete('/family/household', auth, c.deleteLeaveHousehold);
router.get('/family/pets', auth, c.getSharedPets);

module.exports = router;
