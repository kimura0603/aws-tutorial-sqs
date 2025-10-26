
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as apigw from 'aws-cdk-lib/aws-apigateway';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as sources from 'aws-cdk-lib/aws-lambda-event-sources';

export default class FifoDeepStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);
    const queue = new sqs.Queue(this, 'FifoQ', {
      fifo: true,
      contentBasedDeduplication: true,
      visibilityTimeout: cdk.Duration.seconds(30),
      queueName: 'FifoDeepQueue.fifo'
    });
    const producer = new NodejsFunction(this, 'Producer', {
      entry: 'lambda/producer.js',
      environment: { QUEUE_URL: queue.queueUrl },
    });
    queue.grantSendMessages(producer);
    const worker = new NodejsFunction(this, 'Worker', {
      entry: 'lambda/worker.js',
    });
    worker.addEventSource(new sources.SqsEventSource(queue, { batchSize: 1 }));
    const api = new apigw.LambdaRestApi(this, 'Api', { handler: producer, proxy: false });
    api.root.addResource('send').addMethod('POST');
    new cdk.CfnOutput(this, 'ApiEndpoint', { value: api.url });
  }
}
