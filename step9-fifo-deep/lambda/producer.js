
const AWS = require('aws-sdk');
const sqs = new AWS.SQS();
exports.handler = async (event) => {
  const body = JSON.parse(event.body || '{}');
  const groups = Number(body.groups || 1);
  const perGroup = Number(body.perGroup || 20);
  const ids = [];
  for (let g=0; g<groups; g++) {
    const groupId = `user-${g}`;
    for (let i=0; i<perGroup; i++) {
      const message = { id: `${groupId}-${Date.now()}-${i}` };
      const res = await sqs.sendMessage({
        QueueUrl: process.env.QUEUE_URL,
        MessageBody: JSON.stringify(message),
        MessageGroupId: groupId,
        MessageDeduplicationId: message.id,
      }).promise();
      ids.push(res.MessageId);
    }
  }
  return { statusCode: 200, body: JSON.stringify({ enqueued: ids.length, groups, perGroup }) };
};
