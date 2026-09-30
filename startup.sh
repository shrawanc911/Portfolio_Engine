#!/bin/sh

echo "Downloading token.json from S3..."
aws s3 cp s3://dhan-token/token.json /usr/src/app/dist/src/data/token.json

echo "Starting backend..."
npm run start:prod
