const { isDemoMode } = require('../prismaClient');
const demoStore = require('../utils/demoStore');
const serviceRatingService = require('../services/serviceRating.service');

const handleError = (res, error, fallback = 500) => {
  res.status(error.status || fallback).json({ error: error.message });
};

const getRatings = async (req, res) => {
  try {
    if (isDemoMode()) {
      return res.json(demoStore.getServiceRatings(req.user));
    }
    const ratings = await serviceRatingService.getRatingsForUser(req.user);
    res.json(ratings);
  } catch (error) {
    handleError(res, error);
  }
};

const getEligible = async (req, res) => {
  try {
    const userId = req.user?.id || req.user?._id;
    if (isDemoMode()) {
      return res.json(demoStore.getEligibleServiceRatings(req.user));
    }
    const eligible = await serviceRatingService.getEligibleTargets(userId);
    res.json(eligible);
  } catch (error) {
    handleError(res, error);
  }
};

const createRating = async (req, res) => {
  try {
    if (isDemoMode()) {
      const rating = demoStore.createServiceRating(req.user, req.body);
      return res.status(201).json(rating);
    }
    const rating = await serviceRatingService.createRating(req.user, req.body);
    res.status(201).json(rating);
  } catch (error) {
    handleError(res, error, 400);
  }
};

const getStats = async (req, res) => {
  try {
    const type = req.query.type || 'delivery';
    if (isDemoMode()) {
      return res.json(demoStore.getServiceRatingStats(type));
    }
    const stats = await serviceRatingService.getStatsByRegion(type);
    res.json(stats);
  } catch (error) {
    handleError(res, error);
  }
};

const deleteRating = async (req, res) => {
  try {
    if (isDemoMode()) {
      demoStore.deleteServiceRating(req.params.id, req.user);
      return res.json({ message: 'Note supprimée' });
    }
    await serviceRatingService.deleteRating(req.params.id, req.user);
    res.json({ message: 'Note supprimée' });
  } catch (error) {
    handleError(res, error);
  }
};

module.exports = {
  getRatings,
  getEligible,
  createRating,
  getStats,
  deleteRating,
};
