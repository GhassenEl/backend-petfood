const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dns = require('dns');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });

dns.setServers(['8.8.8.8', '1.1.1.1']);

// Suppress util._extend deprecation warning from legacy dependencies
process.removeAllListeners('warning');
process.on('warning', (warning) => {
  if (warning.name === 'DeprecationWarning') {
    return; // Suppress all deprecation warnings from node_modules
  }
  console.warn(warning);
});

const app = express();
app.set('trust proxy', 1); // Required for express-rate-limit behind React dev server proxy
const PORT = process.env.PORT || 5001;

// Verify critical env vars at startup
if (!process.env.JWT_SECRET) {
  console.error('❌ FATAL: JWT_SECRET is not set. Check that backend/.env exists and dotenv loaded it.');
  process.exit(1);
}
console.log('✅ JWT_SECRET loaded successfully');

// CORS configuration for local development.
const allowedOrigins = [
  'http://127.0.0.1:3000',
  'http://127.0.0.1:3001',
  'http://127.0.0.1:3002',
  'http://127.0.0.1:3003',
'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:3002',
  'http://localhost:3003',
  'http://localhost:30007',
  'http://192.168.0.114:30007',
  'http://192.168.0.114:3000',
  'http://192.168.0.114:3001',
  'http://192.168.0.114:3002',
  'http://192.168.0.114:3003',
];

const isPrivateDevOrigin = (origin) =>
  /^http:\/\/(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+):\d+$/.test(origin);

const corsOptions = {
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin) || isPrivateDevOrigin(origin)) {
      return callback(null, true);
    }
    return callback(new Error(`CORS blocked origin: ${origin}`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'HEAD'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Origin', 'Accept'],
  optionsSuccessStatus: 200
};
app.use(cors(corsOptions));
app.use((err, req, res, next) => {
  if (err.message?.startsWith('CORS blocked origin:')) {
    return res.status(403).json({ error: err.message });
  }
  next(err);
});

// Security headers to prevent X-Frame-Options issues
app.use((req, res, next) => {
res.setHeader('Content-Security-Policy', "default-src 'self'; frame-ancestors 'self' http://localhost:* http://127.0.0.1:* http://192.168.*:* http://10.*:* http://172.*:* *; frame-src 'self' http://localhost:* http://127.0.0.1:* http://192.168.*:* http://10.*:* http://172.*:* blob: data: ;");
  res.setHeader('X-Content-Type-Options', 'nosniff');
  next();
});

// Debug logging
app.use((req, res, next) => {
  console.log(`🌐 ${req.method} ${req.path} from origin: ${req.get('Origin') || 'no-origin'}`);
  next();
});
app.use(express.json());

// Construct MONGO_URI from env vars
// Supports BOTH:
// - MONGO_URI (mongodb+srv or mongodb://)
// - MONGO_URI_DIRECT (non-SRV mongodb://), recommended when SRV/DNS fails
if (process.env.MONGO_URI_DIRECT) {
  process.env.MONGO_URI = process.env.MONGO_URI_DIRECT;
  console.log(' Using MONGO_URI_DIRECT override (non-SRV)');
}

if (!process.env.MONGO_URI) {
  const user = process.env.MONGODB_USER;
  const passRaw = process.env.MONGODB_PASSWORD;
  const cluster = process.env.MONGODB_CLUSTER;

  // Only build MONGO_URI when every part is present
  if (user && passRaw && cluster) {
    const pass = encodeURIComponent(passRaw);
    process.env.MONGO_URI = `mongodb+srv://${user}:${pass}@${cluster}/petfoodtn?retryWrites=true&w=majority`;
    console.log(' MONGO_URI constructed from env vars (mongodb+srv)');
  } else {
    console.error('Missing MONGODB_USER/PASSWORD/CLUSTER in backend/.env');
  }
}


// MongoDB connection
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('MongoDB connected successfully');
    return;
  } catch (err) {
    console.error('❌ MongoDB connection failed:', err.message);

    // If SRV fails (DNS/lookup), try a safer fallback strategy.
    // Prefer MONGO_URI_DIRECT (non-SRV) if provided.
    if (process.env.MONGO_URI_DIRECT) {
      console.error('❌ MongoDB connection failed even with MONGO_URI_DIRECT');
      return;
    }

    // If we were using mongodb+srv, we previously attempted a hardcoded fallback.
    // Replace it with a parameterized attempt using the same cluster + auth info.
    // Note: this fallback may still fail if your cluster string is wrong,
    // but it avoids hardcoding shard hostnames.
    if (process.env.MONGO_URI?.startsWith('mongodb+srv://')) {
      const user = process.env.MONGODB_USER;
      const pass = encodeURIComponent(process.env.MONGODB_PASSWORD);
      const cluster = process.env.MONGODB_CLUSTER;

      if (user && pass && cluster) {
        const fallbackUri = `mongodb://${user}:${pass}@${cluster}:27017/petfoodtn?authSource=admin&retryWrites=true&w=majority&tls=true`;
        console.log('Attempting direct MongoDB fallback URI without SRV (host from MONGODB_CLUSTER)');
        try {
          await mongoose.connect(fallbackUri);
          console.log('MongoDB connected successfully using direct fallback URI');
          return;
        } catch (fallbackErr) {
          console.error('❌ MongoDB direct fallback connection failed:', fallbackErr.message);
        }
      } else {
        console.error('Missing MONGODB_USER/PASSWORD/CLUSTER for fallback URI');
      }
    }
  }
};

connectDB().catch(console.error);

// Routes
app.use('/api/auth', require('./routes/auth.routes'));
app.use('/api/products', require('./routes/products.routes'));
app.use('/api/orders', require('./routes/orders.routes'));
app.use('/api/reviews', require('./routes/reviews.routes'));
app.use('/api/complaints', require('./routes/complaints.routes'));
app.use('/api/invoices', require('./routes/invoices.routes'));
app.use('/api/users', require('./routes/users.routes'));
app.use('/api/contact', require('./routes/contact.routes'));
app.use('/api/notifications', require('./routes/notifications.routes'));
app.use('/api/messages', require('./routes/messages.routes'));
app.use('/api/pets', require('./routes/pets.routes'));
app.use('/api/chat', require('./routes/chat.routes'));
app.use('/api/veterinary', require('./routes/veterinary.routes'));
app.use('/api/stripe', require('./routes/stripe'));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy',
    timestamp: new Date().toISOString(),
    message: 'PetfoodTN Backend API ready',
    uptime: process.uptime()
  });
});

// Basic route
app.get('/', (req, res) => {
  res.json({ message: 'PetfoodTN Backend API running! Visit /health for status.' });
});

app.listen(PORT, '0.0.0.0', () => {
console.log(` Server running on http://localhost:${PORT} and http://192.168.0.114:${PORT} (accessible from 0.0.0.0)`);
}).on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(` Port ${PORT} is already in use. Is another backend server running?`);
  } else {
    console.error(' Server failed to start:', err.message);
  }
  process.exit(1);
});
