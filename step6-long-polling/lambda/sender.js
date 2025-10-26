
const AWS = require('aws-sdk');
const sqs = new AWS.SQS();
exports.handler = async (event) => {
  const body = JSON.parse(event.body || '{}');
  const n = Number(body.count || 1);
  const sent = [];
  for (let i = 0; i < n; i++) {
    const msg = { id: Date.now().toString() + '-' + i, payload: body.payload || 'demo' };
    await sqs.sendMessage({ QueueUrl: process.env.QUEUE_URL, MessageBody: JSON.stringify(msg) }).promise();
    sent.push(msg.id);
  }
  return { statusCode: 200, body: JSON.stringify({ sent }) };
};
