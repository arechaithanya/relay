const { MongoClient } = require("mongodb");
const { mongoUri } = require("./config");

let client;
let db;

async function connectDatabase() {
  if (db) return db;

  client = new MongoClient(mongoUri);
  await client.connect();
  db = client.db();

  await Promise.all([
    db.collection("incidents").createIndex({ id: 1 }, { unique: true }),
    db.collection("incidents").createIndex({ status: 1, severity: -1 }),
    db.collection("timeline").createIndex({ incidentId: 1, timestamp: 1 })
  ]);

  return db;
}

async function closeDatabase() {
  if (client) {
    await client.close();
    client = undefined;
    db = undefined;
  }
}

module.exports = {
  closeDatabase,
  connectDatabase
};
