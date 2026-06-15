const crm = require('../services/ecosystem/clientCrm.service');

const wrap = (fn) => async (req, res) => {
  try {
    const data = await fn(req);
    res.json(data);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || 'Erreur CRM' });
  }
};

exports.getOverview = (req, res) => wrap(() => crm.getCrmOverview())(req, res);

exports.getSegment = (req, res) =>
  wrap((r) => crm.getSegmentMembers(r.params.slug))(req, res);

exports.postCampaign = (req, res) =>
  wrap((r) => crm.createCampaign(r.body))(req, res);

exports.postSendCampaign = (req, res) =>
  wrap((r) => crm.sendCampaign(r.params.id))(req, res);

exports.getMlSuggestions = (req, res) =>
  wrap(() => crm.getCrmMlSuggestions())(req, res);
