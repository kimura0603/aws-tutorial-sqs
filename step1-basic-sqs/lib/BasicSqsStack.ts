
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as apigw from 'aws-cdk-lib/aws-apigateway';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as sources from 'aws-cdk-lib/aws-lambda-event-sources';

export class BasicSqsStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const queue = new sqs.Queue(this, 'BasicQueue', {
      visibilityTimeout: cdk.Duration.seconds(30),
    });

    const producer = new nodejs.NodejsFunction(this, 'Producer', {
      entry: 'lambda/producer.js',
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_20_X,
      environment: { QUEUE_URL: queue.queueUrl },
      bundling: {
        externalModules: ['@aws-sdk/*'],
      },
    });
    queue.grantSendMessages(producer);

    const worker = new nodejs.NodejsFunction(this, 'Worker', {
      entry: 'lambda/worker.js',
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_20_X,
      bundling: {
        externalModules: ['@aws-sdk/*'],
      },
    });
    worker.addEventSource(new sources.SqsEventSource(queue, { batchSize: 1 }));

    const api = new apigw.LambdaRestApi(this, 'Api', { handler: producer, proxy: false });
    api.root.addResource('enqueue').addMethod('POST');

    new cdk.CfnOutput(this, 'ApiEndpoint', { value: api.url });
    new cdk.CfnOutput(this, 'QueueUrl', { value: queue.queueUrl });
  }
}
