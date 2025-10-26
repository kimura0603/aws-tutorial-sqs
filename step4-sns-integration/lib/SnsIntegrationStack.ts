
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as apigw from 'aws-cdk-lib/aws-apigateway';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as subs from 'aws-cdk-lib/aws-sns-subscriptions';
import * as sources from 'aws-cdk-lib/aws-lambda-event-sources';

export class SnsIntegrationStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const topic = new sns.Topic(this, 'Topic');

    const mailQ = new sqs.Queue(this, 'MailQueue');
    const inventoryQ = new sqs.Queue(this, 'InventoryQueue');

    topic.addSubscription(new subs.SqsSubscription(mailQ));
    topic.addSubscription(new subs.SqsSubscription(inventoryQ));

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
    });
    invWorker.addEventSource(new sources.SqsEventSource(inventoryQ, { batchSize: 1 }));

    const api = new apigw.LambdaRestApi(this, 'Api', { handler: producer, proxy: false });
    api.root.addResource('publish').addMethod('POST');

    new cdk.CfnOutput(this, 'ApiEndpoint', { value: api.url });
  }
}
