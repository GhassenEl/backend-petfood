const http = require('http');
const https = require('https');

const createJsonProxy = (targetOrigin) => {
  if (!targetOrigin) {
    throw new Error('targetOrigin is required');
  }

  return (req, res) => {
    const targetUrl = new URL(req.originalUrl, targetOrigin);
    const transport = targetUrl.protocol === 'https:' ? https : http;
    const hasBody = !['GET', 'HEAD'].includes(req.method) && req.body !== undefined;
    const body = hasBody ? JSON.stringify(req.body) : null;

    const headers = { ...req.headers };
    delete headers.host;
    delete headers['content-length'];

    if (body) {
      headers['content-type'] = headers['content-type'] || 'application/json';
      headers['content-length'] = Buffer.byteLength(body);
    }

    const proxyReq = transport.request(
      targetUrl,
      {
        method: req.method,
        headers,
      },
      (proxyRes) => {
        res.statusCode = proxyRes.statusCode || 502;
        for (const [key, value] of Object.entries(proxyRes.headers)) {
          if (value !== undefined) {
            res.setHeader(key, value);
          }
        }
        proxyRes.pipe(res);
      }
    );

    proxyReq.on('error', (error) => {
      res.status(502).json({
        error: 'Microservice unavailable',
        detail: error.message,
      });
    });

    if (body) {
      proxyReq.write(body);
    }
    proxyReq.end();
  };
};

module.exports = { createJsonProxy };
