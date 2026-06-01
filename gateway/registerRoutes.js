const { createJsonProxy } = require('../utils/proxyRequest');

/**
 * Monte une route locale ou proxy vers un microservice si SERVICE_URL est défini.
 */
function mountService(app, mountPath, localRouter, serviceUrlEnv) {
  const serviceUrl = process.env[serviceUrlEnv];
  if (serviceUrl) {
    const proxy = createJsonProxy(serviceUrl.replace(/\/$/, ''));
    console.log(`  ↪ Proxy ${mountPath} → ${serviceUrl}`);
    app.use(mountPath, (req, res) => proxy(req, res));
    return;
  }
  app.use(mountPath, localRouter);
}

function registerGatewayRoutes(app) {
  console.log('📡 Gateway routes:');

  mountService(app, '/api/products', require('../routes/products.routes'), 'PRODUCT_SERVICE_URL');
  mountService(app, '/api/orders', require('../routes/orders.routes'), 'ORDER_SERVICE_URL');
  mountService(app, '/api/users', require('../routes/users.routes'), 'USER_SERVICE_URL');
  mountService(app, '/api/pets', require('../routes/pets.routes'), 'USER_SERVICE_URL');

  const vetUrl = process.env.VETERINARY_SERVICE_URL;
  if (vetUrl) {
    const vetProxy = createJsonProxy(vetUrl.replace(/\/$/, ''));
    console.log(`  ↪ Proxy /api/veterinary → ${vetUrl}`);
    app.use('/api/veterinary', (req, res) => vetProxy(req, res));
  } else {
    app.use('/api/veterinary', require('../routes/veterinaryContact.routes'));
    app.use('/api/veterinary', require('../routes/veterinaryAppointments.routes'));
    app.use('/api/veterinary', require('../routes/veterinaryAppointments.alias.routes'));
    app.use('/api/veterinary', require('../routes/veterinary.routes'));
  }

  app.use('/api/auth', require('../routes/auth.routes'));
  app.use('/api/reviews', require('../routes/reviews.routes'));
  app.use('/api/service-ratings', require('../routes/serviceRatings.routes'));
  app.use('/api/favorites', require('../routes/favorites.routes'));
  app.use('/api/loyalty', require('../routes/loyalty.routes'));
  app.use('/api/complaints', require('../routes/complaints.routes'));
  app.use('/api/invoices', require('../routes/invoices.routes'));
  app.use('/api/contact', require('../routes/contact.routes'));
  app.use('/api/notifications', require('../routes/notifications.routes'));
  app.use('/api/messages', require('../routes/messages.routes'));
  app.use('/api/feeder', require('../routes/feeder.routes'));
  app.use('/api/nutrition', require('../routes/nutrition.routes'));
  app.use('/api/chat', require('../routes/chat.routes'));
  app.use('/api/vet', require('../routes/vet.routes'));
  app.use('/api/livreur', require('../routes/livreur.routes'));
  app.use('/api/events', require('../routes/events.routes'));
  app.use('/api/stripe', require('../routes/stripe'));
  app.use('/api/payments', require('../routes/payments.routes'));
  app.use('/api/ai', require('../routes/ai.routes'));
  app.use('/api/leave-requests', require('../routes/leave.routes'));
  app.use('/api/promotions', require('../routes/promotions.routes'));
  app.use('/api/wallet', require('../routes/wallet.routes'));
  app.use('/api/service-bookings', require('../routes/serviceBookings.routes'));
}

module.exports = { registerGatewayRoutes, mountService };
