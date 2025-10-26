
const AWS = require('aws-sdk');
const sqs = new AWS.SQS();
exports.handler = async (event) => {
  const body = JSON.parse(event.body || '{}');
  const id = body.id || Date.now().toString();
  const sleep = Number(body.sleep || 8);
  const msg = { id, sleep };
  await sqs.sendMessage({ QueueUrl: process.env.QUEUE_URL, MessageBody: JSON.stringify(msg) }).promise();
  return { statusCode: 200, body: JSON.stringify({ queued: msg }) };
};
