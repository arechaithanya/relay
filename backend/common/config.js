const env = process.env;

function brokers() {
  return (env.KAFKA_BROKERS || "localhost:9092")
    .split(",")
    .map((broker) => broker.trim())
    .filter(Boolean);
}

/**
 * Validate required environment variables at startup.
 * Throws an error listing every missing variable so the service fails fast
 * with a clear message instead of crashing later with a cryptic error.
 */
function validateConfig(required = []) {
  const missing = required.filter((key) => !env[key]);
  if (missing.length) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }
}

module.exports = {
  brokers,
  mongoUri: env.MONGO_URI || "mongodb://localhost:27017/crisissync",
  frontendOrigin: env.FRONTEND_ORIGIN || "http://localhost:5173",
  validateConfig
};
