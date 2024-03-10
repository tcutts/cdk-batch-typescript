import * as cdk from "aws-cdk-lib";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as s3n from "aws-cdk-lib/aws-s3-notifications";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as batch from "aws-cdk-lib/aws-batch";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as iam from "aws-cdk-lib/aws-iam";
import * as sns from "aws-cdk-lib/aws-sns";
import * as events from "aws-cdk-lib/aws-events";
import * as targets from "aws-cdk-lib/aws-events-targets";
import { QueueDisablingBudget } from "./queue-disabling-budget";
import { Construct } from "constructs";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";

const COST_TAG = "research-stack-id";

export class CdkBatchTsStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Create a VPC for everything to go in
    const vpc = new ec2.Vpc(this, "ResearchVPC", {
      maxAzs: 1,
    });

    const compute_environment = new batch.ManagedEc2EcsComputeEnvironment(
      this,
      "ComputeEnvironment",
      {
        vpc,
        useOptimalInstanceClasses: true,
      }
    );

    compute_environment.tags.setTag(COST_TAG, this.node.addr, undefined, true);

    // Create a job queue connected to the Compute Environment
    const job_queue = new batch.JobQueue(this, "ResearchQueue");
    job_queue.addComputeEnvironment(compute_environment, 1);

    // Create a role for jobs to assume as they run; this role will be needed
    // to access the input and output buckets
    const job_role = new iam.Role(this, "JobRole", {
      assumedBy: new iam.ServicePrincipal("ecs-tasks.amazonaws.com"),
    });

    // Create a job definition for the word_count container
    const job_def = new batch.EcsJobDefinition(this, "WordCountJob", {
      container: new batch.EcsEc2ContainerDefinition(
        this,
        "ContainerDefinition",
        {
          image: ecs.ContainerImage.fromAsset("job_definitions/word_count"),
          memory: cdk.Size.mebibytes(1000),
          cpu: 1,
          jobRole: job_role,
        }
      ),
      retryAttempts: 3,
      timeout: cdk.Duration.days(1),
    });

    // Create input and output buckets.Auto_delete_objects
    // is set to true because this is an example, but is not
    // advisable in production.
    const input_bucket = new s3.Bucket(this, "InputBucket", {
      encryption: s3.BucketEncryption.S3_MANAGED,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    const output_bucket = new s3.Bucket(this, "OutputBucket", {
      encryption: s3.BucketEncryption.S3_MANAGED,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    const bucket_arrival_function = new NodejsFunction(this, "BucketArrival", {
      runtime: lambda.Runtime.NODEJS_18_X,
      entry: "lambda/bucket_arrival/index.ts",
      handler: "handler",
      environment: {
        JOBDEF: job_def.jobDefinitionArn,
        JOBQUEUE: job_queue.jobQueueName,
        OUTPUT_BUCKET: output_bucket.bucketName,
        AWS_NODEJS_CONNECTION_REUSE_ENABLED: "1",
      },
    });

    // Send object creation notifications from the input bucket
    // to the lambda function
    input_bucket.addObjectCreatedNotification(
      new s3n.LambdaDestination(bucket_arrival_function)
    );

    // Allow lambda function to submit jobs
    job_def.grantSubmitJob(bucket_arrival_function, job_queue);

    // Give the job_role the permissions it needs on the S3 buckets
    input_bucket.grantRead(job_role);
    output_bucket.grantWrite(job_role);

    // Specify email destination as a parameter
    const email = new cdk.CfnParameter(this, "Notification Email", {
      description: "Email adress job success/failures will be sent to",
      allowedPattern: "\\w+(\\w+.)*\\w*@(\\w+.)+(\\w+)",
    });

    //Create an SNS topic for notifications
    const topic = new sns.Topic(this, "JobCompletionTopic");

    if (email.valueAsString === "") {
      // Subscribe to it
      new sns.Subscription(this, "NotifyMe", {
        topic,
        protocol: sns.SubscriptionProtocol.EMAIL,
        endpoint: email.valueAsString,
      });
    }

    // EventBridge between Batch and topic, for success and failure
    new events.Rule(this, "BatchEvents", {
      eventPattern: {
        source: ["aws.batch"],
        detailType: ["Batch Job State Change"],
        detail: {
          status: events.Match.anyOf(["SUCCEEDED", "FAILED"]),
        },
      },
      targets: [new targets.SnsTopic(topic)],
    });

    const budget = new QueueDisablingBudget(this, "StackBudget", {
      email: email.valueAsString,
      costTag: COST_TAG,
    });

    budget.disableJobQueueOnAlert(job_queue);

    cdk.Tags.of(this).add(COST_TAG, this.node.addr);

    // Print out the buckets' names
    new cdk.CfnOutput(this, "InputBucketName", {
      value: input_bucket.bucketName,
    });
    new cdk.CfnOutput(this, "OutputBucketName", {
      value: output_bucket.bucketName,
    });
    new cdk.CfnOutput(this, "QueueName", { value: job_queue.jobQueueName });
  }
}
