'use strict'; 
//
const child_process = require('child_process'); 
const aws = require('aws-sdk'); 
const s3 = new aws.S3(); 
const exec = require('child_process').execSync; 
const fs = require('fs'); 

function systemSync(cmd) {
    return exec(cmd).toString();
};

exports.handler = (event, context, callback) => {
    if (!event.sourceBucket) {
        return callback('Please specify a bucket to use as sourceBucket');
    }
    
    //console.log(JSON.stringify(event), null, 2);
    //console.log('*************************************************');
    console.log('GDAL Args: ' + process.env.gdalArgs);
    console.log('find: ' + process.env.findVal);
    console.log('replace with: ' + process.env.replaceVal);
    console.log('Source Bucket: ' + event.sourceBucket);
    console.log('Source Key: ' + event.sourceObjectKey);
    console.log('Target Bucket: ' + process.env.targetBucket);
    console.log('Target Prefix: ' + process.env.targetPrefix); 
    if(event.otherKeyID && event.otherSecretKey) {
    	console.log('Other Key ID: ' + process.env.otherKeyID);
    	console.log('Other Secrect Key: ' + process.env.otherSecretKey);
    	var accessKeys = 'env AWS_ACCESS_KEY_ID=' + process.env.otherKeyID
        + ' AWS_SECRET_ACCESS_KEY=' + process.env.otherSecretKey;
    } else {
    	console.log('Role Key ID: ' + process.env.AWS_ACCESS_KEY_ID);
    	console.log('Role Secret Key: ' + process.env.AWS_SECRET_ACCESS_KEY);
	var accessKeys = 'env AWS_ACCESS_KEY_ID=' + process.env.AWS_ACCESS_KEY_ID
        + ' AWS_SECRET_ACCESS_KEY=' + process.env.AWS_SECRET_ACCESS_KEY
        + ' AWS_SESSION_TOKEN=' + process.env.AWS_SESSION_TOKEN;
    }

    // the AWS access keys will not be neccessary in gdal ver 2.3 due to IAM Role support
    const cmd = accessKeys
        + ' AWS_REQUEST_PAYER=requester'
        + ' GDAL_DISABLE_READDIR_ON_OPEN=YES CPL_VSIL_CURL_ALLOWED_EXTENSIONS=.tif ./bin/gdal_translate '
        + process.env.gdalArgs 
        + ' /vsis3/' + event.sourceBucket + '/' + event.sourceObjectKey + ' /tmp/output.tif';
    console.log('Command: ' + cmd);

    console.log(systemSync('rm -fv /tmp/*'));
    console.log(systemSync(cmd));
    console.log(systemSync('ls -alh /tmp'));

    if (process.env.replaceVal && process.env.findVal) {
        var uploadObjectKey = event.sourceObjectKey.replace(process.env.findVal, process.env.replaceVal);
    }
    else {
        var uploadObjectKey = event.sourceObjectKey;
    }

    if (process.env.targetPrefix) {
        var uploadObjectKey = process.env.targetPrefix + '/' + uploadObjectKey;
    }
    console.log('uploadObjectKey: ' + uploadObjectKey);

    var body = fs.createReadStream('/tmp/output.tif');

    var s3obj = new aws.S3({params: {Bucket: process.env.targetBucket, Key: uploadObjectKey, ACL:'authenticated-read'}});

    s3obj.upload({Body: body})
        .on('httpUploadProgress', function(evt) {
            //console.log(evt);
            })
        .send(function(err, data) {callback(err, 'Process complete!');}
    )
};
