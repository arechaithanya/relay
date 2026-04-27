const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };
const activeLevel = LEVELS[process.env.LOG_LEVEL] ?? LEVELS.info;

function log(level, data) {
  if (LEVELS[level] > activeLevel) return;
  const entry = {
    ts: new Date().toISOString(),
    level,
    service: process.env.SERVICE_NAME || "crisissync",
    ...(typeof data === "string" ? { msg: data } : data)
  };
  const output = JSON.stringify(entry);
  if (level === "error" || level === "warn") {
    process.stderr.write(output + "\n");
  } else {
    process.stdout.write(output + "\n");
  }
}

const logger = {
  info: (data) => log("info", data),
  warn: (data) => log("warn", data),
  error: (data) => log("error", data),
  debug: (data) => log("debug", data)
};

module.exports = logger;
