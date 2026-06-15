const { recordRequest } = require('../utils/requestMetrics');

const requestMetricsMiddleware = (req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    if (!req.path?.startsWith('/api')) return;
    recordRequest({
      method: req.method,
      path: req.path,
      status: res.statusCode,
      ms: Date.now() - start,
    });
  });
  next();
};

module.exports = { requestMetricsMiddleware };
