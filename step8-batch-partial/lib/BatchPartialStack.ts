
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as apigw from 'aws-cdk-lib/aws-apigateway';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as sources from 'aws-cdk-lib/aws-lambda-event-sources';

export default class BatchPartialStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);
    const dlq = new sqs.Queue(this, 'DLQ');
    const queue = new sqs.Queue(this, 'BatchQueue', { deadLetterQueue: { queue: dlq, maxReceiveCount: 2 } });
    const producer = new NodejsFunction(this, 'Producer', {
      entry: 'lambda/producer.js',
      environment: { QUEUE_URL: queue.queueUrl },
    });
    queue.grantSendMessages(producer);
    const worker = new NodejsFunction(this, 'Worker', {
      entry: 'lambda/worker.js',
    });
    worker.addEventSource(new sources.SqsEventSource(queue, { batchSize: 10, reportBatchItemFailures: true }));
    const api = new apigw.LambdaRestApi(this, 'Api', { handler: producer, proxy: false });
    api.root.addResource('enqueue').addMethod('POST');
    new cdk.CfnOutput(this, 'ApiEndpoint', { value: api.url });
  }
}
