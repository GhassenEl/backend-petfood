const activityLogService = require('../services/activityLog.service');

const listActivityLogs = async (req, res) => {
  try {
    const result = await activityLogService.listLogs({
      role: req.query.role,
      module: req.query.module,
      search: req.query.search,
      limit: req.query.limit,
      offset: req.query.offset,
    });
    res.json({ ...result, source: 'server', demo: false });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Impossible de charger les journaux' });
  }
};

const appendActivityLog = async (req, res) => {
  try {
    const { action, target, details, module, actorRole, actorName } = req.body || {};
    if (!action) {
      return res.status(400).json({ error: 'action requis' });
    }
    const row = await activityLogService.logFromRequest(req, {
      action,
      target: target || '',
      details: details || '',
      module: module || 'platform',
      actorRole,
      actorName,
    });
    res.status(201).json(row);
  } catch (error) {
    res.status(500).json({ error: error.message || 'Impossible d\'enregistrer le journal' });
  }
};

const exportActivityLogs = async (req, res) => {
  try {
    const format = req.originalUrl?.includes('export.csv') || req.query.format === 'csv' ? 'csv' : 'json';
    const { contentType, body, filename } = await activityLogService.exportLogs(
      {
        role: req.query.role,
        module: req.query.module,
        search: req.query.search,
      },
      format,
    );
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(body);
  } catch (error) {
    res.status(500).json({ error: error.message || 'Export impossible' });
  }
};

module.exports = {
  listActivityLogs,
  appendActivityLog,
  exportActivityLogs,
};
