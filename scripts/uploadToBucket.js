const gcs = require('@google-cloud/storage');
const path = require('path');
const fs = require('fs');
const storage = gcs({
  projectId: process.env.GCLOUD_PROJECT_ID,
  keyFilename: path.resolve(process.env.HOME, './gcloud-service-key.json')
});

const bucket = storage.bucket('static.dashgithub.com');

bucket.upload('./dist/index.html',{
  public:true,
  dest:'./index.html'
}, function  (err, res) {
  if(err){
    throw err;
  }
  console.log(res);
});