
const AWS = require('aws-sdk');
const sns = new AWS.SNS();

exports.handler = async (event) => {
  const body = JSON.parse(event.body || '{}');
  const id = body.id || Date.now().toString();
  const order = {
    id,
    type: 'order.created',
    userId: body.userId || 'u1',
    items: body.items || [{ sku: 'SKU-1', qty: 1 }],
    shouldFailMail: !!body.failMail,
    shouldFailInventory: !!body.failInventory,
  };

  await sns.publish({
    TopicArn: process.env.TOPIC_ARN,
    Message: JSON.stringify(order),
    Subject: order.type
  }).promise();

  return { statusCode: 200, body: JSON.stringify({ ok: true, order }) };
};
