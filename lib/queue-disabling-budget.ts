import { Construct } from "constructs";
import * as cdk from "aws-cdk-lib";
import * as budgets from "aws-cdk-lib/aws-budgets";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as njsl from "aws-cdk-lib/aws-lambda-nodejs";
import * as batch from "aws-cdk-lib/aws-batch";
import * as sns from "aws-cdk-lib/aws-sns";
import * as les from "aws-cdk-lib/aws-lambda-event-sources";
import * as iam from "aws-cdk-lib/aws-iam";

// This construct is an L3 construct which creates a Budget which:
//     * Emails the user when the budget reaches 95%
//     * Optionally disables a queue so that no further work can be submitted

export interface QueueDisablingBudgetProps {
  email: string;
  costTag: string;
}

export class QueueDisablingBudget extends Construct {
  public budgetTopic: sns.Topic;

  constructor(scope: Construct, id: string, props: QueueDisablingBudgetProps) {
    super(scope, id);

    const budgetLimit = new cdk.CfnParameter(this, "BudgetLimit", {
      default: 5,
      minValue: 0,
      type: "Number",
    });

    budgetLimit.overrideLogicalId("BudgetLimit");

    // SNS topic for budget alerts to go to
    this.budgetTopic = new sns.Topic(this, "BudgetTopic");

    const stack = cdk.Stack.of(this);
    const accountId = stack.account;

    this.budgetTopic.grantPublish(
      new iam.ServicePrincipal("budgets.amazonaws.com", {
        conditions: {
          StringEquals: { "aws:sourceAccount": accountId },
          ArnLike: { "aws:SourceArn": `arn:aws:budgets::${accountId}:*` },
        },
      })
    );

    // Create the budget itself
    new budgets.CfnBudget(this, "Budget", {
      budget: {
        budgetName: `${stack.stackName}Budget`,
        budgetType: "COST",
        timeUnit: "MONTHLY",
        budgetLimit: {
          amount: budgetLimit.valueAsNumber,
          unit: "USD",
        },
        costFilters: {
          TagKeyValue: [`user:${props.costTag}$${stack.node.addr}`],
        },
      },
      notificationsWithSubscribers: [
        {
          notification: {
            comparisonOperator: "GREATER_THAN",
            notificationType: "ACTUAL",
            threshold: 95,
            thresholdType: "PERCENTAGE",
          },
          subscribers: [
            { subscriptionType: "EMAIL", address: props.email },
            { subscriptionType: "SNS", address: this.budgetTopic.topicArn },
          ],
        },
      ],
    });

    new cdk.CfnOutput(this, "BudgetAlertTopic", {
      value: this.budgetTopic.topicName,
    });
  }

  disableJobQueueOnAlert(jobQueue: batch.IJobQueue) {
    const budgetAlertFunction = new njsl.NodejsFunction(
      this,
      "BudgetExceeded",
      {
        runtime: lambda.Runtime.NODEJS_18_X,
        entry: "lambda/budget_exceeded/index.ts",
        handler: "handler",
        environment: {
          JOBQUEUE: jobQueue.jobQueueName,
        },
      }
    );

    // Allow the lambda function to inactivate the queue
    budgetAlertFunction.role?.attachInlinePolicy(
      new iam.Policy(this, "DisableQueuePolicy", {
        statements: [
          new iam.PolicyStatement({
            actions: ["batch:UpdateJobQueue"],
            resources: [jobQueue.jobQueueArn],
          }),
        ],
      })
    );

    budgetAlertFunction.addEventSource(
      new les.SnsEventSource(this.budgetTopic)
    );
  }
}
