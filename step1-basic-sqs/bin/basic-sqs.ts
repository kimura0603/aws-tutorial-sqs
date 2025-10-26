#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { BasicSqsStack } from '../lib/BasicSqsStack';
const app = new cdk.App();
new BasicSqsStack(app, 'BasicSqsStack', {});
