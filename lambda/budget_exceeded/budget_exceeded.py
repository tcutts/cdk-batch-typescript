import boto3
import os
import pprint

batch = boto3.client("batch")

def handler(event, context):
    jobQueue=os.environ["JOBQUEUE"]
    try:
        print(f"Budget exceeded, inactivating {jobQueue}\n")
        pprint.pp(event)

        batch.update_job_queue(
            jobQueue=jobQueue,
            state='DISABLED'
        )
        response = {"status": "success"}
        pprint.pp({"Response": response})
        return response
    except Exception as e:
        print(e)
        print(f"Error disabling queue {jobQueue}\n")
        raise e
