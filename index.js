#!/usr/bin/env node
'use strict';

const opts = require('opts');
const AWS = require('aws-sdk');

/*
 * Command line arguments handling
 */
const options = [
  {
    short: 'r',
    long: 'region',
    description: 'AWS region',
    value: true,
  },
  {
    short: 'b',
    long: 'bulk-size',
    description: 'Number of objects to be deleted in one batch (1...1000), default to 500',
    value: true
  },
  {
    short: 'q',
    long: 'quiet',
    description: 'Display nothing but critical error messages',
    value: false
  },
  {
    short: 'v',
    long: 'verbose',
    description: 'Display verbose messages for troubleshooting',
    value: false
  },
];
const args = [{
  name: 'bucket',
  required: true
}];
opts.parse(options, args, true);

/*
 * Initialize AWS environment
 */
const region = opts.get('region');
if (region) {
  AWS.config.region = region;
}
AWS.config.apiVersions = {
  s3: '2006-03-01',
};
const s3 = new AWS.S3();
const bucket = opts.arg('bucket');
const bulkSize = opts.get('bulk-size') || 500;

main();


function deleteObjects(objects, callback) {
  const params = {
    Bucket: bucket,
    Delete: {
      Objects: [],
    },
  };
  objects.forEach((obj) => {
    if (obj.VersionId) {
      params.Delete.Objects.push({
        Key: obj.Key,
        VersionId: obj.VersionId,
      });
    } else {
      params.Delete.Objects.push({
        Key: obj.Key,
      });
    }
  });
  s3.deleteObjects(params, callback);
}

function listObjects(marker, callback) {
  const params = {
    Bucket: bucket,
    ContinuationToken: marker,
    MaxKeys: bulkSize,
  };
  s3.listObjectsV2(params, callback);
}

function listVersions(keyMarker, versionMarker, callback) {
  const params = {
    Bucket: bucket,
    KeyMarker: keyMarker,
    VersionIdMarker: versionMarker,
    MaxKeys: bulkSize,
  };
  return s3.listObjectVersions(params, callback);
}

function main() {

  let marker = undefined;
  doUntil(
    () => {
      return new Promise((resolve, reject) => {
        listObjects(marker, (errList, resultList) => {
          if (errList) {
            return reject(errList);
          }
          marker = resultList.NextContinuationToken;
          logger.debug(`[DEBUG] ${resultList.Contents.length} object(s) listed. isLastBatch=${marker ? 'N' : 'Y'}`);
          if (resultList.Contents.length === 0) {
            return resolve();
          }
          deleteObjects(resultList.Contents, (errDelete, resultDelete) => {
            if (errDelete) {
              return reject(errDelete);
            }
            logger.debug('[DEBUG] ' + JSON.stringify(resultDelete));
            return resolve();
          })
        })
      })
    },
    () => {
      return !marker;
    },
    (err) => {
      logger.error(`Failed in deleting the objects in bucket ${bucket}.`, err);
      process.exit(1);
    })
    .then(() => {
      let keyMarker = undefined;
      let versionMarker = undefined;
      return doUntil(
        () => {
          return new Promise((resolve, reject) => {
            listVersions(keyMarker, versionMarker, (errList, resultList) => {
              if (errList) {
                return reject(errList);
              }
              if (resultList.IsTruncated) {
                keyMarker = resultList.NextKeyMarker;
                versionMarker = resultList.NextVersionIdMarker;
              } else {
                keyMarker = undefined;
                versionMarker = undefined;
              }
              logger.debug(
                `[DEBUG] ${resultList.DeleteMarkers.length} version(s) listed. isLastBatch=${keyMarker ? 'N' : 'Y'}`);
              if (resultList.DeleteMarkers.length === 0) {
                return resolve();
              }
              const toDelete = [];
              if (resultList.Versions && resultList.Versions.length > 0) {
                resultList.Versions.forEach((v) => {
                  toDelete.push(v);
                })
              }
              if (resultList.DeleteMarkers && resultList.DeleteMarkers.length > 0) {
                resultList.DeleteMarkers.forEach((d) => {
                  toDelete.push(d);
                })
              }
              if (toDelete.length > 0) {
                deleteObjects(toDelete, (errDelete, resultDelete) => {
                  if (errDelete) {
                    return reject(errDelete);
                  }
                  logger.debug('[DEBUG] ' + JSON.stringify(resultDelete));
                  return resolve();
                })
              } else {
                return resolve();
              }
            })
          })
        },
        () => {
          return !keyMarker;
        },
        (err) => {
          logger.error(`Failed in deleting the versions in bucket ${bucket}.`, err);
          process.exit(2);
        })
    })
    .then(() => {
      logger.log(`Bucket ${bucket} emptied.`);
      process.exit(0);
    })
    .catch((err) => {
      logger.error(`Failed in emptying the bucket ${bucket}.`, err);
      process.exit(3);
    })
}

/**
 * Executes action repeatedly until condition returns true and then resolves the promise. Rejects if action
 * returns a promise that rejects or if an error is thrown anywhere.
 *
 * @param {Function}action
 * @param {Function}condition
 * @param {Function}error
 * @return {*}
 * @constructor
 */
function doUntil(action, condition, error) {
  /**
   * Recursive function to make sure the promise resolves in the end
   *
   * @param {Function}fn
   * @return {Promise}
   */
  function wrap(fn) {
    return new Promise((resolve) => {
      resolve(fn());
    });
  }

  return wrap(function loop() {
    return wrap(action)
      .then(() => {
        if (!condition()) {
          return loop();
        }
      })
      .catch((err) => error(err));
  });
}

const logger = (function () {
  return {
    log: function () {
      if (!opts.get('quiet')) {
        console.log.apply(console, Array.prototype.slice.call(arguments));
      }
    },
    error: function () {
        console.error.apply(console, Array.prototype.slice.call(arguments));
    },
    debug: function () {
      if (!opts.get('quiet') && opts.get('verbose')) {
        console.log.apply(console, Array.prototype.slice.call(arguments));
      }
    }
  }
}());
