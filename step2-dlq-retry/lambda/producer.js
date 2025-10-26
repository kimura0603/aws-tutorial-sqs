
const AWS = require('aws-sdk');
const sqs = new AWS.SQS();
exports.handler = async (event) => {
  const body = JSON.parse(event.body || '{}');
  const msg = {
    id: Date.now().toString(),
    imageUrl: body.imageUrl || 'https://example.com/sample.jpg',
    shouldFail: !!body.fail,  // trueで失敗をシミュレート
  };
  await sqs.sendMessage({
    QueueUrl: process.env.QUEUE_URL,
    MessageBody: JSON.stringify(msg),
  }).promise();
  return { statusCode: 200, body: JSON.stringify({ ok: true, queued: msg }) };
};
