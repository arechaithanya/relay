const { Kafka, logLevel } = require("kafkajs");
const { brokers } = require("./config");

function createKafka(clientId) {
  return new Kafka({
    clientId,
    brokers: brokers(),
    retry: {
      initialRetryTime: 500,
      retries: 12
    },
    logLevel: logLevel.ERROR
  });
}

async function createProducer(clientId) {
  const kafka = createKafka(clientId);
  const producer = kafka.producer();
  await producer.connect();
  return producer;
}

async function createConsumer(clientId, groupId) {
  const kafka = createKafka(clientId);
  const consumer = kafka.consumer({ groupId });
  await consumer.connect();
  return consumer;
}

async function publishJson(producer, topic, payload, key = payload.id) {
  await producer.send({
    topic,
    messages: [
      {
        key,
        value: JSON.stringify(payload)
      }
    ]
  });
}

function parseMessage(message) {
  return JSON.parse(message.value.toString());
}

module.exports = {
  createConsumer,
  createKafka,
  createProducer,
  parseMessage,
  publishJson
};
