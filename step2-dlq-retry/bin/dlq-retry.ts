#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import {'DlqRetryStack'} from '../lib/DlqRetryStack';
const app = new cdk.App();
new DlqRetryStack(app, 'DlqRetryStack', {});
