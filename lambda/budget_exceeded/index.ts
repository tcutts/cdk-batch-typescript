import { BatchClient, UpdateJobQueueCommand } from "@aws-sdk/client-batch";
import { Handler } from "aws-lambda";

export const handler: Handler = async function (event: any) {
  const batch = new BatchClient();
  console.log(JSON.stringify(event));

  const command = new UpdateJobQueueCommand({
    jobQueue: process.env.JOBQUEUE,
    state: "DISABLED",
  });

  try {
    const data = await batch.send(command);
    console.log(data);
  } catch (err) {
    console.log(err);
  }
};
