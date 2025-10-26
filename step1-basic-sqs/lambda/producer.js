const { SQSClient, SendMessageCommand } = require('@aws-sdk/client-sqs');
const sqs = new SQSClient({});

exports.handler = async (event) => {
  const body = JSON.parse(event.body || '{}');
  const message = {
    id: Date.now().toString(),
    imageUrl: body.imageUrl || 'https://example.com/sample.jpg',
  };
  await sqs.send(new SendMessageCommand({
    QueueUrl: process.env.QUEUE_URL,
    MessageBody: JSON.stringify(message),
  }));

  return { statusCode: 200, body: JSON.stringify({ ok: true, queued: message }) };
};