const { getClientDashboard } = require('../services/clientDashboard.service');
const familyHousehold = require('../services/familyHousehold.service');

const getDashboard = async (req, res) => {
  try {
    const data = await getClientDashboard(req.user);
    res.json(data);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
};

const getHousehold = async (req, res) => {
  try {
    const household = await familyHousehold.findHouseholdForUser(
      req.user?.id || req.user?._id
    );
    res.json({ household });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
};

const postHousehold = async (req, res) => {
  try {
    const household = await familyHousehold.createHousehold(req.user, req.body || {});
    res.status(201).json({ household });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
};

const postJoinHousehold = async (req, res) => {
  try {
    const household = await familyHousehold.joinHousehold(req.user, req.body?.inviteCode);
    res.json({ household });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
};

const deleteLeaveHousehold = async (req, res) => {
  try {
    const result = await familyHousehold.leaveHousehold(req.user);
    res.json(result);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
};

const getSharedPets = async (req, res) => {
  try {
    const userId = req.user?.id || req.user?._id;
    const pets = await familyHousehold.getSharedPets(userId);
    res.json({ pets });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
};

module.exports = {
  getDashboard,
  getHousehold,
  postHousehold,
  postJoinHousehold,
  deleteLeaveHousehold,
  getSharedPets,
};
