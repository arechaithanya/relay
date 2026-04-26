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
  frontendOrigin: env.FRONTEND_ORIGIN || "http://localhost:5173"
};
