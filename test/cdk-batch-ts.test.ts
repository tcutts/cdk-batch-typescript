import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import * as CdkBatchTs from '../lib/cdk-batch-ts-stack';

const app = new cdk.App()
const stack = new CdkBatchTs.CdkBatchTsStack(app, "TestStack")
const template = Template.fromStack(stack)

test('Buckets', () => {
    template.resourceCountIs("AWS::S3::Bucket", 2)
})

test('SNS', () => {
    template.resourceCountIs("AWS::SNS::Topic", 2)
    template.findResources("AWS::SNS::Subscription", { "Protocol": "email" })
})

test('Batch', () => {
    template.hasResourceProperties("AWS::Batch::JobDefinition", { "Type": "container" })
    template.resourceCountIs("AWS::Batch::JobQueue", 1)
    template.resourceCountIs("AWS::Batch::ComputeEnvironment", 1)
})

test('Budget', () => {
    template.resourceCountIs("AWS::Budgets::Budget", 1)
})
