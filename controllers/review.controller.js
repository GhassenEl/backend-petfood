const mongoose = require('mongoose');
const Review = require('../models/Review');
const demoStore = require('../utils/demoStore');

const isDemoMode = () => !mongoose.connection || mongoose.connection.readyState !== 1;

const getCount = async (req, res) => {
  try {
    if (isDemoMode()) {
      return res.json({ count: demoStore.getReviews(req.user).length });
    }
    const count = await Review.countDocuments();
    res.json({ count });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const getReviews = async (req, res) => {
  try {
    if (isDemoMode()) {
      return res.json(demoStore.getReviews(req.user));
    }

    if (req.user.role !== 'admin') {
      const reviews = await Review.find({ userId: req.user._id })
        .populate('userId', 'email name')
        .populate('productId', 'name imageUrl')
        .sort({ createdAt: -1 });
      return res.json(reviews);
    }

    const reviews = await Review.find()
      .populate('userId', 'email name')
      .populate('productId', 'name imageUrl')
      .sort({ createdAt: -1 });
    res.json(reviews);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const createReview = async (req, res) => {
  try {
    if (isDemoMode()) {
      return res.status(201).json(demoStore.createReview(req.user, req.body));
    }

    const review = new Review({
      userId: req.user._id,
      productId: req.body.productId,
      rating: req.body.rating,
      comment: req.body.comment,
      emotion: req.body.emotion || 'neutral',
      aiSuggested: req.body.aiSuggested || false,
    });
    await review.save();
    await review.populate([
      { path: 'userId', select: 'email name' },
      { path: 'productId', select: 'name imageUrl' },
    ]);
    res.status(201).json(review);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

const updateReview = async (req, res) => {
  try {
    if (isDemoMode()) {
      const review = demoStore.updateReview(req.params.id, req.body);
      if (!review) return res.status(404).json({ error: 'Review not found' });
      return res.json(review);
    }
    const review = await Review.findByIdAndUpdate(
      req.params.id,
      { rating: req.body.rating, comment: req.body.comment, emotion: req.body.emotion || 'neutral', aiSuggested: req.body.aiSuggested || false },
      { new: true }
    ).populate('userId', 'email name').populate('productId', 'name imageUrl');
    if (!review) return res.status(404).json({ error: 'Review not found' });
    res.json(review);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

const deleteReview = async (req, res) => {
  try {
    if (isDemoMode()) {
      const review = demoStore.deleteReview(req.params.id);
      if (!review) return res.status(404).json({ error: 'Review not found' });
      return res.json({ message: 'Review deleted' });
    }
    let review = await Review.findById(req.params.id);
    if (!review) return res.status(404).json({ error: 'Review not found' });
    if (req.user.role !== 'admin' && req.user._id.toString() !== review.userId.toString()) {
      return res.status(403).json({ error: 'Not authorized' });
    }
    review = await Review.findByIdAndDelete(req.params.id);
    if (!review) return res.status(404).json({ error: 'Review not found' });
    res.json({ message: 'Review deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const getEmotionAnalytics = async (req, res) => {
  try {
    if (isDemoMode()) {
      const allReviews = demoStore.getReviews(req.user).filter(r => r.productId?._id === req.params.productId);
      const emotions = { happy: 0, satisfied: 0, neutral: 0, disappointed: 0, frustrated: 0 };
      allReviews.forEach(r => { emotions[r.emotion || 'neutral'] = (emotions[r.emotion || 'neutral'] || 0) + 1; });
      return res.json({ productId: req.params.productId, emotions, total: allReviews.length });
    }

    const reviews = await Review.find({ productId: req.params.productId });
    const emotions = { happy: 0, satisfied: 0, neutral: 0, disappointed: 0, frustrated: 0 };
    reviews.forEach(r => { emotions[r.emotion] = (emotions[r.emotion] || 0) + 1; });
    res.json({ productId: req.params.productId, emotions, total: reviews.length });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

module.exports = { getReviewCount: getCount, getReviews, createReview, updateReview, deleteReview, getEmotionAnalytics };
