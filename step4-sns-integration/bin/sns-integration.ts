#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import {'SnsIntegrationStack'} from '../lib/SnsIntegrationStack';
const app = new cdk.App();
new SnsIntegrationStack(app, 'SnsIntegrationStack', {});
