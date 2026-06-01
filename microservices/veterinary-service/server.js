const express = require('express');
const cors = require('cors');
const path = require('path');
const { connectDB, isDemoMode } = require('../../prismaClient');

require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const app = express();
const PORT = Number(process.env.VETERINARY_SERVICE_PORT) || 5101;

if (!process.env.JWT_SECRET) {
  console.error('FATAL: JWT_SECRET is not set. Check backend/.env.');
  process.exit(1);
}

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

const initDatabase = async () => {
  try {
    if (!isDemoMode()) {
      await connectDB();
    } else {
      console.log('Veterinary service running in DEMO_MODE without SQL database');
    }
  } catch (err) {
    console.error('Veterinary service database error:', err.message);
    process.exit(1);
  }
};

initDatabase();

app.get('/health', (req, res) => {
  res.json({
    service: 'veterinary-service',
    status: 'healthy',
    timestamp: new Date().toISOString(),
  });
});

// Specific veterinary sub-routes must stay before the generic /:id records route.
app.use('/api/veterinary', require('../../routes/veterinaryContact.routes'));
app.use('/api/veterinary', require('../../routes/veterinaryAppointments.routes'));
app.use('/api/veterinary', require('../../routes/veterinaryAppointments.alias.routes'));
app.use('/api/veterinary', require('../../routes/veterinary.routes'));

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Veterinary microservice running on http://localhost:${PORT}`);
});
