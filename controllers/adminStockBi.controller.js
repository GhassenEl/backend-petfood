const stockBi = require('../services/ecosystem/adminStockBi.service');

exports.getStockBiPack = async (req, res) => {
  try {
    const data = await stockBi.getAdminStockBiPack();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message || 'Erreur stock BI' });
  }
};
