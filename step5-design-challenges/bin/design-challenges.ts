#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { DesignChallengesStack } from '../lib/DesignChallengesStack';
const app = new cdk.App();
new DesignChallengesStack(app, 'DesignChallengesStack', {});
