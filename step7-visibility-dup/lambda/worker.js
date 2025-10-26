
const AWS = require('aws-sdk');
const sqs = new AWS.SQS();
const ddb = new AWS.DynamoDB.DocumentClient();
const TABLE = process.env.TABLE_NAME;

exports.handler = async (event) => {
  for (const record of event.Records) {
    const job = JSON.parse(record.body);
    const seen = await ddb.get({ TableName: TABLE, Key: { messageId: job.id } }).promise();
    if (seen.Item) { console.log('🔁 Duplicate detect. Skip:', job.id); continue; }
    console.log('Start', job.id, 'sleep', job.sleep);
    const end = Date.now() + job.sleep * 1000;
    while (Date.now() < end) {
      try {
        await sqs.changeMessageVisibility({ QueueUrl: process.env.QUEUE_URL, ReceiptHandle: record.receiptHandle, VisibilityTimeout: 10 }).promise();
      } catch(e) { console.error('changeMessageVisibility error', e); }
      await new Promise(r => setTimeout(r, 3000));
    }
    await ddb.put({ TableName: TABLE, Item: { messageId: job.id, processedAt: Date.now() }, ConditionExpression: 'attribute_not_exists(messageId)' }).promise();
    console.log('✅ Completed', job.id);
  }
  return {};
};
