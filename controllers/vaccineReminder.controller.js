const vaccineReminderService = require('../services/vaccineReminder.service');

const getReminders = async (req, res) => {
  try {
    const userId = req.user?.id || req.user?._id;
    await vaccineReminderService.syncReminders(userId, req.user);
    const reminders = await vaccineReminderService.getReminders(req.user);
    res.json(reminders);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

module.exports = { getReminders };
