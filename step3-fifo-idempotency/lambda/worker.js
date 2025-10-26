
const AWS = require('aws-sdk');
const ddb = new AWS.DynamoDB.DocumentClient();
const TABLE = process.env.TABLE_NAME;

exports.handler = async (event) => {
  for (const record of event.Records) {
    const job = JSON.parse(record.body);
    const found = await ddb.get({ TableName: TABLE, Key: { messageId: job.id } }).promise();
    if (found.Item) {
      console.log('🔁 Duplicate detected. Skip:', job.id);
      continue;
    }
    console.log('Processing (FIFO):', job);
    await new Promise(r => setTimeout(r, 800));
    await ddb.put({
      TableName: TABLE,
      Item: { messageId: job.id, processedAt: Date.now() },
      ConditionExpression: 'attribute_not_exists(messageId)'
    }).promise();
    console.log('✅ Completed:', job.id);
  }
  return {};
};
