const express = require('express');
const { auth, adminAuth } = require('../middleware/auth');
const {
  getReviews,
  createReview,
  updateReview,
  deleteReview,
  getReviewCount,
  getEmotionAnalytics
} = require('../controllers/review.controller');

const router = express.Router();

router.get('/count', auth, adminAuth, getReviewCount);
router.get('/', auth, getReviews);
router.post('/', auth, createReview);
router.put('/:id', auth, updateReview);
router.delete('/:id', auth, deleteReview);
router.get('/emotion-analytics/:productId', auth, getEmotionAnalytics);

module.exports = router;
