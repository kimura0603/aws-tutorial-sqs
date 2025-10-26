
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as apigw from 'aws-cdk-lib/aws-apigateway';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as sqs from 'aws-cdk-lib/aws-sqs';

export default class LongPollingStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);
    const queue = new sqs.Queue(this, 'LongPollQueue', {
      receiveMessageWaitTime: cdk.Duration.seconds(20),
      visibilityTimeout: cdk.Duration.seconds(30),
    });
    const sender = new lambda.Function(this, 'Sender', {
      runtime: lambda.Runtime.NODEJS_20_X,
      code: lambda.Code.fromAsset('lambda'),
      handler: 'sender.handler',
      environment: { QUEUE_URL: queue.queueUrl },
    });
    queue.grantSendMessages(sender);
    const poller = new lambda.Function(this, 'Poller', {
      runtime: lambda.Runtime.NODEJS_20_X,
      code: lambda.Code.fromAsset('lambda'),
      handler: 'poller.handler',
      environment: { QUEUE_URL: queue.queueUrl, DEFAULT_WAIT: '20' },
      timeout: cdk.Duration.seconds(30),
    });
    const api = new apigw.RestApi(this, 'Api', {});
    api.root.addResource('enqueue').addMethod('POST', new apigw.LambdaIntegration(sender));
    api.root.addResource('poll').addMethod('GET', new apigw.LambdaIntegration(poller));
    new cdk.CfnOutput(this, 'ApiBase', { value: api.url });
  }
}
