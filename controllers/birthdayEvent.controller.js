const {
  suggestBirthdayEvents,
  reserveBirthdayEvent,
} = require('../services/birthdayEvent.service');

const getBirthdaySuggestions = async (req, res) => {
  try {
    const data = await suggestBirthdayEvents(req.user);
    res.json(data);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || 'Erreur anniversaires' });
  }
};

const postBirthdayReserve = async (req, res) => {
  try {
    const result = await reserveBirthdayEvent(req.user, req.body || {});
    res.status(201).json(result);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || 'Réservation impossible' });
  }
};

module.exports = { getBirthdaySuggestions, postBirthdayReserve };
