var aws = require('aws-sdk');
var s3 = new aws.S3();
var exec = require('child_process').execSync;
var fs = require('fs');

exports.handler = function(event, context, callback) {
    //console.log(JSON.stringify(process.env));
    console.log('gdal args: ' + process.env.gdalArgs);
    console.log('Bucket Name: ' + event.sourceBucket);
    console.log('Object Key: ' + event.sourceObjectKey);
    console.log('Bucket Name: ' + event.targetBucket);
    console.log('target prefix: ' + event.targetPrefix);
    console.log('find: ' + process.env.findVal);
    console.log('replace: ' + process.env.replaceVal);
    var inputStream = fs.createWriteStream('/tmp/input.tif');
    s3.getObject({Bucket: event.sourceBucket, Key: event.sourceObjectKey, RequestPayer: 'requester'})
      .createReadStream()
      .pipe(inputStream)
      .on('finish', function() {
          inputStream.end;
          var gdalParams = 'env AWS_ACCESSS_KEY_ID=' + process.env.AWS_ACCESS_KEY_ID
            + ' AWS_SECRET_ACCESS_KEY=' + process.env.AWS_SECRET_ACCESS_KEY
            + ' AWS_SESSION_TOKEN=' + process.env.AWS_SESSION_TOKEN
            + ' ./bin/gdal_translate '
            + process.env.gdalArgs
            + ' /tmp/input.tif /tmp/output.tif';
          console.log('gdalParams: ' + gdalParams);
          cmdoutput = exec(gdalParams);
          //var cmdoutput = exec('ls -alh /tmp/input.tif');
          console.log('stdout: ' + cmdoutput);

          if (process.env.replaceVal) {
           var uploadObjectKey = event.sourceObjectKey.replace(process.env.findVal, process.env.replaceVal);
          }
          else {
           var uploadObjectKey = event.sourceObjectKey;
          }
          if (event.targetPrefix) {
           var uploadObjectKey = event.targetPrefix + '/' + uploadObjectKey;
          }
          console.log('uploadObjectKey: ' + uploadObjectKey);

          var body = fs.createReadStream('/tmp/output.tif');

          var s3obj = new aws.S3({params: {Bucket: event.targetBucket, Key: uploadObjectKey}});
          s3obj.upload({Body: body})
            .on('httpUploadProgress', function(evt) { 
		//console.log(evt); 
		})
            .send(function(err, data) {callback(err, 'Process complete!');});
     })
};
