const walletService = require('../services/wallet.service');

const getWallet = async (req, res) => {
  try {
    const userId = req.user?.id || req.user?._id;
    const wallet = await walletService.getWallet(userId, req.user);
    if (!wallet) return res.status(404).json({ error: 'Utilisateur introuvable' });
    res.json(wallet);
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
};

const topUp = async (req, res) => {
  try {
    const userId = req.user?.id || req.user?._id;
    const amount = Number(req.body?.amount);
    const paymentMethod = req.body?.paymentMethod || 'demo';

    if (!amount || amount < 5) {
      return res.status(400).json({ error: 'Montant minimum : 5 DT' });
    }
    if (amount > 500) {
      return res.status(400).json({ error: 'Montant maximum : 500 DT par recharge' });
    }

    const result = await walletService.creditWallet(
      userId,
      amount,
      `Recharge portefeuille (${paymentMethod})`,
      req.body?.referenceId || null,
      req.user
    );
    res.json(result);
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
};

module.exports = { getWallet, topUp };
