#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { LongPollingStack } from '../lib/LongPollingStack';
const app = new cdk.App();
new LongPollingStack(app, 'LongPollingStack', {});
