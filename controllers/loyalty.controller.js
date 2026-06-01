const loyaltyService = require('../services/loyalty.service');

const getUserId = (req) => req.user?.id || req.user?._id;

const getAccount = async (req, res) => {
  try {
    const account = await loyaltyService.getAccount(getUserId(req));
    if (!account) return res.status(404).json({ error: 'Compte introuvable' });
    res.json(account);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const redeem = async (req, res) => {
  try {
    const { tierId } = req.body || {};
    if (!tierId) return res.status(400).json({ error: 'tierId requis' });
    const voucher = await loyaltyService.redeemTier(getUserId(req), tierId);
    res.status(201).json(voucher);
  } catch (error) {
    res.status(error.status || 400).json({ error: error.message });
  }
};

const getOffers = async (req, res) => {
  try {
    const offers = await loyaltyService.getPersonalizedOffers(getUserId(req));
    res.json(offers);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

module.exports = { getAccount, redeem, getOffers };
