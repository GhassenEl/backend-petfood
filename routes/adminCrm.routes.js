const express = require('express');
const { auth, adminAuth } = require('../middleware/auth');
const c = require('../controllers/adminCrm.controller');

const router = express.Router();

router.get('/overview', auth, adminAuth, c.getOverview);
router.get('/segments/:slug', auth, adminAuth, c.getSegment);
router.get('/ml-suggestions', auth, adminAuth, c.getMlSuggestions);
router.post('/campaigns', auth, adminAuth, c.postCampaign);
router.post('/campaigns/:id/send', auth, adminAuth, c.postSendCampaign);

module.exports = router;
