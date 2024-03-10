#!/bin/bash

set -e
set -o pipefail

date
echo ==============================================
echo "Args: $@"
echo "jobId: $AWS_BATCH_JOB_ID"
echo "jobQueue: $AWS_BATCH_JQ_NAME"
echo "computeEnvironment: $AWS_BATCH_CE_NAME"
echo "inputFile: $S3_INPUT_OBJECT"
echo "inputBucket: $S3_INPUT_BUCKET"
echo "outputBucket: $S3_OUTPUT_BUCKET"
echo ==============================================

aws s3 cp "s3://${S3_INPUT_BUCKET}/${S3_INPUT_OBJECT}" - | \
    wc | aws s3 cp - "s3://${S3_OUTPUT_BUCKET}/${S3_INPUT_OBJECT}.out"
status=$?
date
exit $status
