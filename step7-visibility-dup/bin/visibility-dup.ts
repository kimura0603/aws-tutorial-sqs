#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { VisibilityDupStack } from '../lib/VisibilityDupStack';
const app = new cdk.App();
new VisibilityDupStack(app, 'VisibilityDupStack', {});
