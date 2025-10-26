
const AWS = require('aws-sdk');
const sqs = new AWS.SQS();
exports.handler = async (event) => {
  const qs = event.queryStringParameters || {};
  const wait = Number(qs.wait ?? process.env.DEFAULT_WAIT ?? 0);
  const max = Number(qs.max ?? 1);
  const res = await sqs.receiveMessage({
    QueueUrl: process.env.QUEUE_URL,
    MaxNumberOfMessages: Math.max(1, Math.min(10, max)),
    WaitTimeSeconds: wait,
  }).promise();
  const messages = res.Messages || [];
  for (const m of messages) {
    await sqs.deleteMessage({ QueueUrl: process.env.QUEUE_URL, ReceiptHandle: m.ReceiptHandle }).promise();
  }
  return { statusCode: 200, body: JSON.stringify({ received: messages.length, wait, messageIds: messages.map(m=>m.MessageId) }) };
};
