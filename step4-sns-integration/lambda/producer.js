
const AWS = require('aws-sdk');
const sns = new AWS.SNS();

exports.handler = async (event) => {
  const body = JSON.parse(event.body || '{}');
  const message = {
    id: Date.now().toString(),
    type: body.type || 'order.created',
    userId: body.userId || 'u1',
    payload: body.payload || {}
  };

  await sns.publish({
    TopicArn: process.env.TOPIC_ARN,
    Message: JSON.stringify(message),
    Subject: message.type
  }).promise();

  return { statusCode: 200, body: JSON.stringify({ ok: true, published: message }) };
};
