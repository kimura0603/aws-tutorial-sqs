#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { BatchPartialStack } from '../lib/BatchPartialStack';
const app = new cdk.App();
new BatchPartialStack(app, 'BatchPartialStack', {});
