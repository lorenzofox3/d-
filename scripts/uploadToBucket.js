const gcs = require('@google-cloud/storage');
const path = require('path');
const fs = require('fs');
const storage = gcs({
  projectId: process.env.GCLOUD_PROJECT_ID,
  keyFilename: path.resolve(process.env.HOME, './gcloud-service-key.json')
});


storage.getBuckets(function (err, buckets) {
  if(err){
    throw err;
  }
  console.log(buckets);
});

