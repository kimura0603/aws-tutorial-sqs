
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as apigw from 'aws-cdk-lib/aws-apigateway';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as sources from 'aws-cdk-lib/aws-lambda-event-sources';

export class DlqRetryStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const dlq = new sqs.Queue(this, 'DLQ', { retentionPeriod: cdk.Duration.days(14) });

    const queue = new sqs.Queue(this, 'MainQueue', {
      visibilityTimeout: cdk.Duration.seconds(15),
      deadLetterQueue: { queue: dlq, maxReceiveCount: 3 },
    });

    const producer = new lambda.Function(this, 'Producer', {
      runtime: lambda.Runtime.NODEJS_20_X,
      code: lambda.Code.fromAsset('lambda'),
      handler: 'producer.handler',
      environment: { QUEUE_URL: queue.queueUrl },
    });
    queue.grantSendMessages(producer);

    const worker = new lambda.Function(this, 'Worker', {
      runtime: lambda.Runtime.NODEJS_20_X,
      code: lambda.Code.fromAsset('lambda'),
      handler: 'worker.handler',
    });
    worker.addEventSource(new sources.SqsEventSource(queue, { batchSize: 1 }));

    const api = new apigw.LambdaRestApi(this, 'Api', { handler: producer, proxy: false });
    api.root.addResource('enqueue').addMethod('POST');

    new cdk.CfnOutput(this, 'ApiEndpoint', { value: api.url });
    new cdk.CfnOutput(this, 'QueueUrl', { value: queue.queueUrl });
    new cdk.CfnOutput(this, 'DLQUrl', { value: dlq.queueUrl });
  }
}
