// Quick startup test - validates all routes load without syntax errors
try {
  require('./server');
  console.log(' Backend server module loaded successfully');
  setTimeout(() => {
    console.log('✅ Startup test passed');
    process.exit(0);
  }, 1500);
} catch (e) {
  console.error('Backend startup failed:', e.message);
  process.exit(1);
}
