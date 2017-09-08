const gcs = require('@google-cloud/storage');
const path = require('path');
const walk = require('walk');
const storage = gcs({
  projectId: process.env.GCLOUD_PROJECT_ID,
  keyFilename: path.resolve(process.env.HOME, './gcloud-service-key.json')
});

const bucket = storage.bucket('static.dashgithub.com');
const distWalker = walk.walk('./dist');

distWalker.on('file', function (root, fileStats, next) {
  const rels = root.split('./');
  const r = rels.slice(2).join('/');
  const {name} = fileStats;
  bucket.upload(path.join(root, name), {
    public: true,
    dest: path.join(r, name)
  }, function (err, res) {
    if (err) {
      throw err;
    }
  });
  next();
});