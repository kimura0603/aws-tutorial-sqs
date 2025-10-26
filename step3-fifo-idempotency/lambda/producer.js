
const AWS = require('aws-sdk');
const sqs = new AWS.SQS();

exports.handler = async (event) => {
  const body = JSON.parse(event.body || '{}');
  const id = (body.id || Date.now().toString());
  const userId = body.userId || 'user-123';
  const message = { id, userId, payload: body.payload || 'demo' };

  await sqs.sendMessage({
    QueueUrl: process.env.QUEUE_URL,
    MessageBody: JSON.stringify(message),
    MessageGroupId: userId,
    MessageDeduplicationId: id,
  }).promise();

  return { statusCode: 200, body: JSON.stringify({ ok: true, queued: message }) };
};
