const { exportTable, getDatasetsCatalog } = require('../services/analyticsExport.service');
const { getAnalyticsHub, getPlatformAlerts } = require('../services/analyticsHub.service');

const handleError = (res, error, code = 500) => {
  res.status(error.status || code).json({ error: error.message || 'Erreur analytics' });
};

const getHub = async (req, res) => {
  try {
    const hub = await getAnalyticsHub();
    res.json(hub);
  } catch (error) {
    handleError(res, error);
  }
};

const getAlerts = async (req, res) => {
  try {
    const data = await getPlatformAlerts();
    res.json(data);
  } catch (error) {
    handleError(res, error);
  }
};

const getCatalog = async (req, res) => {
  try {
    const catalog = await getDatasetsCatalog();
    res.json(catalog);
  } catch (error) {
    handleError(res, error);
  }
};

const getExport = async (req, res) => {
  try {
    const format = (req.query.format || 'json').toLowerCase();
    const result = await exportTable(req.params.table, format);
    if (format === 'csv') {
      res.setHeader('Content-Type', result.contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
      return res.send(result.body);
    }
    res.json(result.body);
  } catch (error) {
    handleError(res, error);
  }
};

module.exports = { getHub, getAlerts, getCatalog, getExport };
