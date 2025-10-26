
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as apigw from 'aws-cdk-lib/aws-apigateway';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as subs from 'aws-cdk-lib/aws-sns-subscriptions';
import * as sources from 'aws-cdk-lib/aws-lambda-event-sources';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';

export class DesignChallengesStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const table = new dynamodb.Table(this, 'ProcessedTable', {
      partitionKey: { name: 'messageId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const topic = new sns.Topic(this, 'OrderTopic');

    const mailDlq = new sqs.Queue(this, 'MailDLQ');
    const mailQ = new sqs.Queue(this, 'MailQueue', {
      deadLetterQueue: { queue: mailDlq, maxReceiveCount: 2 },
    });

    const invDlq = new sqs.Queue(this, 'InventoryDLQ');
    const invQ = new sqs.Queue(this, 'InventoryQueue', {
      fifo: true,
      contentBasedDeduplication: true,
      visibilityTimeout: cdk.Duration.seconds(30),
      deadLetterQueue: { queue: invDlq, maxReceiveCount: 3 },
    });

    topic.addSubscription(new subs.SqsSubscription(mailQ));
    topic.addSubscription(new subs.SqsSubscription(invQ));

    const producer = new NodejsFunction(this, 'Producer', {
      entry: 'lambda/producer.js',
      environment: { TOPIC_ARN: topic.topicArn },
    });
    topic.grantPublish(producer);

    const mailWorker = new NodejsFunction(this, 'MailWorker', {
      entry: 'lambda/mailWorker.js',
    });
    mailWorker.addEventSource(new sources.SqsEventSource(mailQ, { batchSize: 1 }));

    const invWorker = new NodejsFunction(this, 'InventoryWorker', {
      entry: 'lambda/inventoryWorker.js',
      environment: { TABLE_NAME: table.tableName },
    });
    table.grantReadWriteData(invWorker);
    invWorker.addEventSource(new sources.SqsEventSource(invQ, { batchSize: 1 }));

    const api = new apigw.LambdaRestApi(this, 'Api', { handler: producer, proxy: false });
    api.root.addResource('order').addMethod('POST');

    new cdk.CfnOutput(this, 'ApiEndpoint', { value: api.url });
  }
}
