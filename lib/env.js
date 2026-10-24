// Loads settings from a .env file (if there is one) before anything else runs.
try {
  process.loadEnvFile();
} catch {}
