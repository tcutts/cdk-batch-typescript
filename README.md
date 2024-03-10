# Introduction to CDK for Research Software Engineers

## Why do I care?

Science depends on the reproducibility of results.  This includes the
reproducibility of analysis.

Historically, a lot of researchers struggled to run each other's code;
developed on an individual specific system, and requiring difficult porting
work to run elsewhere.

## Containers solve that don't they?

Containers help solve a lot of this problem by at least packaging an
application and a lot of its dependencies in a single runnable module.  But
that's only part of the story.  What about the dependencies which aren't
directly part of the application?  What about everything else you need to run
a scientific analysis at scale?  Batch queues.  HPC nodes.  High performance
networks.  Firewalls.  Centralised logging.  Fault notifications.  The list
goes on...

AWS has all of these features and more, but configuring them all individually
through the AWS console can be laborious and error prone.

AWS CloudFormation is a service which allows you to describe all of your
infrastratucture in template files, in either YAML or JSON.  The service turns
these templates into a series of API calls and executes them to created the
infrastructure.

However, CloudFormation templates still require you to specify many details
and can become unwieldy to write and debug, especially as your stack gets
more complex and has many cross-references between resources.

What if you could write code in TypeScript, or other languages with which you are
already familiar, and have that generate the CloudFormation template for you?
And apply sensible, best practice defaults so that you don't have to directly
code every last detail?  That's what the AWS Cloud Development Kit does.

This allows you to specify your entire application; the containerised app
itself, and the entire infrastructure to run it reproducibly, in a single
code repository.

This is an example of a simple research-oriented architecture, written almost
entirely in Python, to illustrate the principles.

![Architecture diagram](assets/architecture.svg)

1. Dropping files in the `Input Bucket` triggers the `Bucket Arrival` lambda function
1. The function submits a job to the `Batch Queue` which automatically spins up instance(s) to process the jobs.
1. CDK uses docker on your machine to build and upload the container to the Amazon Elastic Container registry.  AWS Batch uses this container to process the file in the input bucket.
1. The results of the job are then stored in  `Output Bucket`
1. An `Event Bus` watches the AWS Batch events, and filters them for job status changes to `SUCCEEDED` or `FAILED` and sends these events to the `JobCompletion` SNS topic.
1. Creates a budget which warns you if your spend goes over an amount you specify, and inactivates the queue so no more work can be submitted.

## Prerequisites

1. Install [Node.js](https://nodejs.org/en/download/) 14.15.0 or later on your system
1. Install Docker on your system
1. Install CDKv2: ```npm install -g aws-cdk```
2. Recommended:  Install the [AWS CLI](https://aws.amazon.com/cli/) on your system
3. Clone this repository
4. Navigate to the root of your checkout
5. If you've never used CDK before, run ```cdk bootstrap```
6. Install the required node modules: ```npm install```
7. In order for the budget to work correctly, you need to have access to your billing information, and [activate the cost allocation tag](https://docs.aws.amazon.com/awsaccountbilling/latest/aboutv2/activate-built-in-tags.html) `research-stack-id` .  Note this can take up to 24 hours to take effect, and resources created before the activation will not be counted in the budget.

## Deploy the stack

```bash
cdk deploy --parameters NotificationEmail=youraddress@example.com --parameters BudgetLimit=100
```

Make a note of the name of the input and output buckets that were created.

Check your email - SNS will ask you to confirm your email address for the
notifications to be sent to, if you have never had emails from SES before.

## Submitting work to the stack

Use the `aws` CLI or web interface to add files to the OutputBucket :

```bash
echo hello research world | aws s3 cp - s3://researchcdkexamplestack-inputbucketnnnnnnnn-mmmmmmmm/helloworld.txt
```

Watch the magic happen in the AWS Console, by navigating to AWS Batch and
looking at Jobs.

Download your results from the output bucket:

```bash
aws s3 cp s3://researchcdkexamplestackxxxxxxxx-yyyyyyyy/helloworld.txt.out -
```

## Useful commands

* `npm run build`   compile typescript to js
* `npm run watch`   watch for changes and compile
* `npm run test`    perform the jest unit tests
* `npx cdk deploy`  deploy this stack to your default AWS account/region
* `npx cdk diff`    compare deployed stack with current state
* `npx cdk synth`   emits the synthesized CloudFormation template
