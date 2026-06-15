const express = require('express');
const cors = require('cors');
const path = require('path');
const { connectDB, isDemoMode } = require('./prismaClient');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });

// Suppress util._extend deprecation warning from legacy dependencies
process.removeAllListeners('warning');
process.on('warning', (warning) => {
  if (warning.name === 'DeprecationWarning') {
    return; // Suppress all deprecation warnings from node_modules
  }
  console.warn(warning);
});

const http = require('http');
const { Server: IOServer } = require('socket.io');
const { setNotificationIo, emitToUser } = require('./utils/notificationHub');

const app = express();
app.set('trust proxy', 1); // Required for express-rate-limit behind React dev server proxy
const BASE_PORT = Number(process.env.PORT) || 5002;


// Verify critical env vars at startup
if (!process.env.JWT_SECRET) {

  console.error('❌ FATAL: JWT_SECRET is not set. Check that backend/.env exists and dotenv loaded it.');
  process.exit(1);
}
console.log('✅ JWT_SECRET loaded successfully');

// CORS configuration for local development and Docker (CORS_ORIGINS env).
const allowedOrigins = [
  'http://127.0.0.1:3000',
  'http://127.0.0.1:3001',
  'http://127.0.0.1:3002',
  'http://127.0.0.1:3003',
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:3002',
  'http://localhost:3003',
  'http://localhost:8080',
  'http://127.0.0.1:8080',
  'http://localhost:30007',
  'http://192.168.0.114:30007',
  'http://192.168.0.114:3000',
  'http://192.168.0.114:3001',
  'http://192.168.0.114:3002',
  'http://192.168.0.114:3003',
  ...(process.env.CORS_ORIGINS || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
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

const uploadsStaticPath = path.join(__dirname, 'uploads');
app.use('/api/uploads', express.static(uploadsStaticPath, { maxAge: '7d', fallthrough: true }));

const { requestMetricsMiddleware } = require('./middleware/requestMetrics.middleware');
app.use(requestMetricsMiddleware);

const { intrusionDetectionMiddleware } = require('./middleware/intrusionDetection.middleware');
const { threatScanMiddleware } = require('./middleware/threatScan.middleware');
app.use('/api', intrusionDetectionMiddleware);
app.use('/api', (req, res, next) => {
  if (!['POST', 'PUT', 'PATCH'].includes(req.method)) return next();
  if (req.path.startsWith('/security/scan')) return next();
  return threatScanMiddleware({ source: 'api_body_scan' })(req, res, next);
});

const initDatabase = async () => {
  try {
    if (!isDemoMode()) {
      await connectDB();
      const { ensureVetsByRegion } = require('./utils/ensureVetsByRegion');
      await ensureVetsByRegion();
    } else {
      console.log('⚠️ DEMO_MODE enabled: running without SQL database');
    }
  } catch (err) {
    console.error('❌ Failed to connect to SQL database:', err.message);
    process.exit(1);
  }
};

initDatabase();

const { registerGatewayRoutes } = require('./gateway/registerRoutes');
registerGatewayRoutes(app);

// MCP bridge (HTTP)
const { auth } = require('./middleware/auth');
const { createMcpRouter } = require('./mcp/mcpHttpServer');
const { tools: chatTools } = require('./mcp/tools/chat.mcpTools');

const mcpTools = {
  ...chatTools,
};

// If you want MCP to be publicly accessible in demo/local, keep auth out.
// Default: protect MCP via auth middleware.
const enableMcp = String(process.env.MCP_ENABLE || 'true').toLowerCase() === 'true';
if (enableMcp) {
  const mcpRouter = createMcpRouter({ tools: mcpTools });
  app.use('/api', auth, mcpRouter);
  console.log(' MCP bridge enabled at /api/mcp and /api/mcp/invoke');
} else {
  console.log(' MCP bridge disabled (MCP_ENABLE=false)');
}


// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy',
    timestamp: new Date().toISOString(),
    message: 'PetFoodTN Backend API ready',
    uptime: process.uptime()
  });
});

// Basic route
app.get('/', (req, res) => {
  res.json({ message: 'PetfoodTN Backend API running! Visit /health for status.' });
});

const tryListen = (port) => {
  const httpServer = http.createServer(app);
  const io = new IOServer(httpServer, {
    cors: {
      origin: true,
      credentials: true,
    },
  });
  setNotificationIo(io);
  const { setPerformanceIo } = require('./services/platformPerformance.service');
  setPerformanceIo(io);
  const { startPlatformPulse } = require('./utils/platformPulse');
  startPlatformPulse(io, 12000);

  io.on('connection', (socket) => {
    console.log(' Socket connected:', socket.id);

    socket.on('join', (data) => {
      const rooms = [];
      if (data?.room) rooms.push(data.room);
      if (data?.userId) rooms.push(`user:${data.userId}`);
      if (data?.role) rooms.push(`role:${data.role}`);
      rooms.forEach((room) => {
        socket.join(room);
        console.log(` Socket ${socket.id} joined room ${room}`);
      });
    });

    socket.on('chat:message', async (payload) => {
      try {
        const room = payload?.room || 'global';
        // Broadcast to room
        io.to(room).emit('chat:message', payload);
        // Persist message if prisma available
        try {
          const { prisma, isDemoMode } = require('./prismaClient');
          if (!isDemoMode()) {
            await prisma.message.create({
              data: {
                senderType: payload.senderType || 'client',
                senderId: payload.senderId || null,
                receiverType: payload.receiverType || 'admin',
                receiverId: payload.receiverId || null,
                orderId: payload.orderId || null,
                message: payload.content || '',
                isRead: false,
              }
            });
          }
        } catch (e) {
          // ignore persistence errors in socket flow
          console.warn('Socket persistence skipped:', e?.message || e);
        }
      } catch (err) {
        console.error('Socket chat handler error:', err?.message || err);
      }
    });

    socket.on('disconnect', (reason) => {
      console.log('🔌 Socket disconnected:', socket.id, reason);
    });
  });

  httpServer.listen(port, '0.0.0.0', () => {
    console.log(`✅ Server (HTTP+Socket.IO) running on http://localhost:${port}`);
  });

  httpServer.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      const allowFallback =
        String(process.env.ALLOW_PORT_FALLBACK || 'false').toLowerCase() === 'true';
      if (allowFallback && port < BASE_PORT + 5) {
        console.warn(`⚠️ Port ${port} occupé — tentative ${port + 1} (ALLOW_PORT_FALLBACK=true)`);
        tryListen(port + 1);
        return;
      }
      console.error(
        `\n❌ Port ${port} déjà utilisé. Le frontend (proxy Vite) attend ce port (backend/.env PORT=${BASE_PORT}).\n` +
          `   Arrêtez l’ancien processus Node, puis relancez :\n` +
          `   PowerShell: Get-NetTCPConnection -LocalPort ${port} -ErrorAction SilentlyContinue | ` +
          `ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }\n` +
          `   Ou définissez ALLOW_PORT_FALLBACK=true et alignez VITE_API_PROXY_TARGET sur le nouveau port.\n`
      );
      process.exit(1);
    }

    console.error('Server failed to start:', err.message);
    process.exit(1);
  });
};

tryListen(BASE_PORT);

