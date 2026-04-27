const env = process.env;

function brokers() {
  return (env.KAFKA_BROKERS || "localhost:9092")
    .split(",")
    .map((broker) => broker.trim())
    .filter(Boolean);
}

module.exports = {
  brokers,
  mongoUri: env.MONGO_URI || "mongodb://localhost:27017/crisissync",
  frontendOrigin: env.FRONTEND_ORIGIN || "http://localhost:5173",
  geminiApiKey: env.GEMINI_API_KEY || env.GOOGLE_API_KEY || "",
  geminiModel: env.GEMINI_MODEL || "gemini-1.5-flash"
};
