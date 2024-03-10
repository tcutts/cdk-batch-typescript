import { BatchClient, SubmitJobCommand } from "@aws-sdk/client-batch";
import { Handler, S3Event } from "aws-lambda";

const batch = new BatchClient();

export const handler: Handler = async function (event: S3Event) {
  const srcBucket = event.Records[0].s3.bucket.name;

  const srcKey = event.Records[0].s3.object.key;

  console.log(`Submitting job for ${srcKey}`);

  const params = {
    jobDefinition: process.env.JOBDEF,
    jobQueue: process.env.JOBQUEUE,
    jobName: srcKey.replace(/[^a-zA-Z0-9_-]/g, "_").substring(0, 127),
    retryStrategy: {
      attempts: 3,
    },
    containerOverrides: {
      environment: [
        { name: "S3_INPUT_OBJECT", value: srcKey },
        { name: "S3_INPUT_BUCKET", value: srcBucket },
        { name: "S3_OUTPUT_BUCKET", value: process.env.S3_OUTPUT_BUCKET },
      ],
    },
  };

  console.log("Parameters: " + JSON.stringify(params));
  const command = new SubmitJobCommand(params);

  try {
    const data = await batch.send(command);
    console.log(data);
  } catch (err) {
    console.log(err);
  }
};
