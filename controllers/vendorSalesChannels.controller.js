const service = require('../services/vendorSalesChannels.service');

const getConfig = async (req, res) => {
  try {
    const data = await service.getSalesChannelsConfig(req.user);
    return res.json(data);
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message });
  }
};

const putConfig = async (req, res) => {
  try {
    const data = await service.updateSalesChannelsConfig(req.user, req.body || {});
    return res.json(data);
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message });
  }
};

const postOfflineOrder = async (req, res) => {
  try {
    const order = await service.createOfflineOrder(req.user, req.body || {});
    return res.status(201).json(order);
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message });
  }
};

const getPublicChannels = async (req, res) => {
  try {
    const data = await service.listPublicVendorChannels(req.params.vendorId);
    if (!data) return res.status(404).json({ error: 'Vendeur introuvable' });
    return res.json(data);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

module.exports = {
  getConfig,
  putConfig,
  postOfflineOrder,
  getPublicChannels,
};
