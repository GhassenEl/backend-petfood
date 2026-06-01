const { spawn } = require('child_process');
const path = require('path');

const backendDir = path.resolve(__dirname, '..');

const start = (name, command, args, env = {}) => {
  const child = spawn(command, args, {
    cwd: backendDir,
    env: { ...process.env, ...env },
    stdio: 'pipe',
    shell: process.platform === 'win32',
  });

  child.stdout.on('data', (data) => process.stdout.write(`[${name}] ${data}`));
  child.stderr.on('data', (data) => process.stderr.write(`[${name}] ${data}`));
  child.on('exit', (code) => {
    console.log(`[${name}] exited with code ${code}`);
  });

  return child;
};

const veterinaryPort = process.env.VETERINARY_SERVICE_PORT || '5101';
const productPort = process.env.PRODUCT_SERVICE_PORT || '5102';
const orderPort = process.env.ORDER_SERVICE_PORT || '5103';
const userPort = process.env.USER_SERVICE_PORT || '5105';

const services = [
  start('product-service', 'node', ['microservices/product-service/server.js'], {
    PRODUCT_SERVICE_PORT: productPort,
  }),
  start('order-service', 'node', ['microservices/order-service/server.js'], {
    ORDER_SERVICE_PORT: orderPort,
  }),
  start('user-service', 'node', ['microservices/user-service/server.js'], {
    USER_SERVICE_PORT: userPort,
  }),
  start('veterinary-service', 'node', ['microservices/veterinary-service/server.js'], {
    VETERINARY_SERVICE_PORT: veterinaryPort,
  }),
  start('api-gateway', 'node', ['server.js'], {
    PRODUCT_SERVICE_URL: `http://127.0.0.1:${productPort}`,
    ORDER_SERVICE_URL: `http://127.0.0.1:${orderPort}`,
    USER_SERVICE_URL: `http://127.0.0.1:${userPort}`,
    VETERINARY_SERVICE_URL: `http://127.0.0.1:${veterinaryPort}`,
  }),
];

console.log('Microservices PetfoodTN démarrés :');
console.log(`  product-service     → :${productPort}`);
console.log(`  order-service       → :${orderPort}`);
console.log(`  user-service        → :${userPort} (+ /api/pets)`);
console.log(`  veterinary-service  → :${veterinaryPort}`);
console.log('  api-gateway         → :5002 (proxy actif)');

const shutdown = () => {
  for (const service of services) {
    if (!service.killed) {
      service.kill();
    }
  }
};

process.on('SIGINT', () => {
  shutdown();
  process.exit(0);
});

process.on('SIGTERM', () => {
  shutdown();
  process.exit(0);
});
