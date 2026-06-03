/**
 * Enregistrement des routes API — mode monolithe uniquement.
 * Toutes les routes sont servies par le même processus Express (server.js).
 * Les variables *_SERVICE_URL sont ignorées (pas de proxy microservices).
 */

const MICROSERVICE_ENV_KEYS = [
  'PRODUCT_SERVICE_URL',
  'ORDER_SERVICE_URL',
  'USER_SERVICE_URL',
  'VETERINARY_SERVICE_URL',
];

const warnIfMicroserviceEnv = () => {
  const set = MICROSERVICE_ENV_KEYS.filter((k) => process.env[k]?.trim());
  if (set.length) {
    console.warn(
      `⚠️  Mode monolithe : variables ignorées (${set.join(', ')}). ` +
        'Supprimez-les de backend/.env pour éviter toute confusion.'
    );
  }
};

function registerGatewayRoutes(app) {
  warnIfMicroserviceEnv();
  console.log('📡 API monolithe (routes locales) :');

  app.use('/api/products', require('../routes/products.routes'));
  app.use('/api/orders', require('../routes/orders.routes'));
  app.use('/api/users', require('../routes/users.routes'));
  app.use('/api/pets', require('../routes/pets.routes'));

  app.use('/api/veterinary', require('../routes/veterinaryContact.routes'));
  app.use('/api/veterinary', require('../routes/veterinaryAppointments.routes'));
  app.use('/api/veterinary', require('../routes/veterinaryAppointments.alias.routes'));
  app.use('/api/veterinary', require('../routes/veterinary.routes'));

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
  app.use('/api/ml', require('../routes/ml.routes'));
  app.use('/api/leave-requests', require('../routes/leave.routes'));
  app.use('/api/promotions', require('../routes/promotions.routes'));
  app.use('/api/wallet', require('../routes/wallet.routes'));
  app.use('/api/service-bookings', require('../routes/serviceBookings.routes'));
  app.use('/api/blog-articles', require('../routes/blogArticles.routes'));
}

/** @deprecated Conservé pour compatibilité — équivalent à registerGatewayRoutes */
const mountService = (app, mountPath, localRouter) => {
  app.use(mountPath, localRouter);
};

module.exports = { registerGatewayRoutes, mountService };
