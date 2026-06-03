/**
 * PostgreSQL : docker compose up → prisma db push → seed.js
 */
const { spawnSync } = require('child_process');
const path = require('path');

const backendRoot = path.resolve(__dirname, '..');
const run = (cmd, args, label) => {
  console.log(`\n▶ ${label}`);
  const r = spawnSync(cmd, args, { cwd: backendRoot, stdio: 'inherit', shell: true });
  if (r.status !== 0) {
    console.error(`❌ Échec : ${label}`);
    process.exit(r.status || 1);
  }
};

console.log('🐘 Configuration PostgreSQL PetfoodTN');

run('docker', ['compose', 'up', '-d'], 'Démarrage PostgreSQL (Docker)');
console.log('⏳ Attente santé PostgreSQL (8s)…');
spawnSync('node', ['-e', 'const d=Date.now();while(Date.now()-d<8000){}'], {
  cwd: backendRoot,
  stdio: 'ignore',
});

run('npx', ['prisma', 'generate'], 'Prisma generate');
run('npx', ['prisma', 'db', 'push'], 'Prisma db push');
run('node', ['seed.js'], 'Seed principal');

console.log('\n✅ Base PostgreSQL prête. Lancez : npm run dev');
