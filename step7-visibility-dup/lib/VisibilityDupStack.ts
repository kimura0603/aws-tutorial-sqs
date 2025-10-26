
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as apigw from 'aws-cdk-lib/aws-apigateway';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as sources from 'aws-cdk-lib/aws-lambda-event-sources';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';

export default class VisibilityDupStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);
    const table = new dynamodb.Table(this, 'IdemTable', {
      partitionKey: { name: 'messageId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
    const queue = new sqs.Queue(this, 'ShortVTQueue', { visibilityTimeout: cdk.Duration.seconds(5) });
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
      environment: { TABLE_NAME: table.tableName },
      timeout: cdk.Duration.seconds(30),
    });
    table.grantReadWriteData(worker);
    worker.addEventSource(new sources.SqsEventSource(queue, { batchSize: 1 }));
    const api = new apigw.LambdaRestApi(this, 'Api', { handler: producer, proxy: false });
    api.root.addResource('enqueue').addMethod('POST');
    new cdk.CfnOutput(this, 'ApiEndpoint', { value: api.url });
  }
}
