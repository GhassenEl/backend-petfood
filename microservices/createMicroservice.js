const express = require('express');
const cors = require('cors');
const path = require('path');
const { connectDB, isDemoMode } = require('../prismaClient');

/**
 * Bootstrap Express pour un microservice PetfoodTN (MVC partagé avec le monolithe).
 * @param {{ serviceName: string, registerRoutes: (app: import('express').Express) => void }} options
 */
function createMicroservice({ serviceName, registerRoutes }) {
  require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

  if (!process.env.JWT_SECRET) {
    console.error(`FATAL [${serviceName}]: JWT_SECRET is not set. Check backend/.env.`);
    process.exit(1);
  }

  const app = express();
  app.use(cors({ origin: true, credentials: true }));
  app.use(express.json());

  const initDatabase = async () => {
    try {
      if (!isDemoMode()) {
        await connectDB();
      } else {
        console.log(`${serviceName}: DEMO_MODE without SQL database`);
      }
    } catch (err) {
      console.error(`${serviceName} database error:`, err.message);
      process.exit(1);
    }
  };

  app.get('/health', (req, res) => {
    res.json({
      service: serviceName,
      status: 'healthy',
      timestamp: new Date().toISOString(),
    });
  });

  registerRoutes(app);

  const start = async (port) => {
    await initDatabase();
    app.listen(port, '0.0.0.0', () => {
      console.log(`${serviceName} running on http://localhost:${port}`);
    });
  };

  return { app, start };
}

module.exports = { createMicroservice };
