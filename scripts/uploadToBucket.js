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
  const rels = root.split('/');
  const r = rels.slice(2).join('/'); //remove ./dist
  const {name} = fileStats;
  const dest = '/' + path.join(r, name);
  console.log(dest);
  bucket.upload(path.join(root, name), {
    public: true,
    dest
  }, function (err, res) {
    if (err) {
      throw err;
    }
  });
  next();
});