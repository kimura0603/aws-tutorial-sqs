
const AWS = require('aws-sdk');
const ddb = new AWS.DynamoDB.DocumentClient();
const TABLE = process.env.TABLE_NAME;

exports.handler = async (event) => {
  for (const r of event.Records) {
    const msg = JSON.parse(r.body);
    const order = JSON.parse(msg.Message);
    const messageId = order.id;

    const found = await ddb.get({ TableName: TABLE, Key: { messageId } }).promise();
    if (found.Item) {
      console.log('🔁 Duplicate inventory event. Skip:', messageId);
      continue;
    }

    console.log('📦 Reserve inventory for order:', messageId, order.items);

    if (order.shouldFailInventory) {
      console.error('Simulated inventory failure for', messageId);
      throw new Error('Inventory failure');
    }

    await new Promise(r => setTimeout(r, 500));

    await ddb.put({
      TableName: TABLE,
      Item: { messageId, processedAt: Date.now() },
      ConditionExpression: 'attribute_not_exists(messageId)'
    }).promise();

    console.log('✅ Inventory reserved:', messageId);
  }
  return {};
};
