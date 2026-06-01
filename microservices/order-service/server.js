const { createMicroservice } = require('../createMicroservice');

const PORT = Number(process.env.ORDER_SERVICE_PORT) || 5103;

const { app, start } = createMicroservice({
  serviceName: 'order-service',
  registerRoutes: (app) => {
    app.use('/api/orders', require('../../routes/orders.routes'));
  },
});

start(PORT);
