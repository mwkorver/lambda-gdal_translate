var aws = require('aws-sdk'); 
var s3 = new aws.S3(); 
var exec = require('child_process').execSync; 
var fs = require('fs'); exports.handler 
= function(event, context, callback) {
    console.log('Bucket Name: ' + event.srcBucket);
    console.log('Object Key: ' + event.srcKey);
    console.log('Bucket Name: ' + event.targetBucket);
    console.log('target prefix: ' + event.targetPrefix);
    console.log('subSample rate: ' + event.subSample);
    console.log('compRate: ' + event.compRate);
    var inputStream = fs.createWriteStream('/tmp/input.tif');
    s3.getObject({Bucket: event.srcBucket, Key: event.srcKey})
      .createReadStream()
      .pipe(inputStream)
      .on('finish', function() {
          inputStream.end;
          var gdalParams = './bin/gdal_translate -b 1 -b 2 -b 3 -of GTiff -outsize '
              + event.subSample + ' ' + event.subSample
              + ' -co tiled=yes -co BLOCKXSIZE=512 -co BLOCKYSIZE=512'
              + ' -co PHOTOMETRIC=YCBCR -co COMPRESS=JPEG -co JPEG_QUALITY='
              + event.compRate
              + ' /tmp/input.tif /tmp/output.tif';

          console.log('gdalParams: ' + gdalParams);
          var cmdoutput = exec(gdalParams);
          //var cmdoutput = exec('ls -alh /tmp/input.tif');
          console.log('stdout: ' + cmdoutput);
          var body = fs.createReadStream('/tmp/output.tif');
          var s3obj = new aws.S3({params: {Bucket: event.targetBucket, Key: event.targetPrefix + event.srcKey}});
          s3obj.upload({Body: body})
            .on('httpUploadProgress', function(evt) { console.log(evt); })
            .send(function(err, data) {callback(err, 'Process complete!');});
     })
};
