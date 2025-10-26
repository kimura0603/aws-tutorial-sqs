#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import {'FifoIdemStack'} from '../lib/FifoIdemStack';
const app = new cdk.App();
new FifoIdemStack(app, 'FifoIdemStack', {});
