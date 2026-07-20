const service = require('../services/vetHealthProducts.service');

const listSubtypes = async (_req, res) => {
  try {
    return res.json({ subtypes: service.listHealthSubtypes() });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

const listVendors = async (_req, res) => {
  try {
    const vendors = await service.listPartnerVendors();
    return res.json({ vendors });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

const listMine = async (req, res) => {
  try {
    const items = await service.listVetHealthCollaborations(req.user.id || req.user._id);
    return res.json({ items });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

const publish = async (req, res) => {
  try {
    const item = await service.publishHealthProductWithVendor(req.user, req.body || {});
    return res.status(201).json(item);
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message });
  }
};

const listVendorProposals = async (req, res) => {
  try {
    const items = await service.listVendorHealthProposals(req.user.id || req.user._id);
    return res.json({ items });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

const respondProposal = async (req, res) => {
  try {
    const item = await service.respondVendorHealthProposal(
      req.user.id || req.user._id,
      req.params.id,
      req.body?.action,
    );
    return res.json(item);
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message });
  }
};

module.exports = {
  listSubtypes,
  listVendors,
  listMine,
  publish,
  listVendorProposals,
  respondProposal,
};
