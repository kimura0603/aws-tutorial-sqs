
const AWS = require('aws-sdk');
const sqs = new AWS.SQS();
exports.handler = async (event) => {
  const body = JSON.parse(event.body || '{}');
  const count = Number(body.count || 10);
  const failEvery = Number(body.failEvery || 3);
  const ps = [];
  for (let i=1; i<=count; i++) {
    const msg = { id: Date.now().toString() + '-' + i, shouldFail: (i % failEvery === 0) };
    ps.push(sqs.sendMessage({ QueueUrl: process.env.QUEUE_URL, MessageBody: JSON.stringify(msg) }).promise());
  }
  await Promise.all(ps);
  return { statusCode: 200, body: JSON.stringify({ enqueued: count, failEvery }) };
};
