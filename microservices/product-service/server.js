const { createMicroservice } = require('../createMicroservice');

const PORT = Number(process.env.PRODUCT_SERVICE_PORT) || 5102;

const { app, start } = createMicroservice({
  serviceName: 'product-service',
  registerRoutes: (app) => {
    app.use('/api/products', require('../../routes/products.routes'));
  },
});

start(PORT);
