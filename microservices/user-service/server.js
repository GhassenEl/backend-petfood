const { createMicroservice } = require('../createMicroservice');

const PORT = Number(process.env.USER_SERVICE_PORT) || 5105;

const { app, start } = createMicroservice({
  serviceName: 'user-service',
  registerRoutes: (app) => {
    app.use('/api/users', require('../../routes/users.routes'));
    app.use('/api/pets', require('../../routes/pets.routes'));
  },
});

start(PORT);
