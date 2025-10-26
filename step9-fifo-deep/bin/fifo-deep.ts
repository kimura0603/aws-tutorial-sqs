#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { FifoDeepStack } from '../lib/FifoDeepStack';
const app = new cdk.App();
new FifoDeepStack(app, 'FifoDeepStack', {});
