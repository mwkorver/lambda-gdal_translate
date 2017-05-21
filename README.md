This is based on Hector Castro's [lambda-gdalinfo](https://github.com/hectcastro/lambda-gdalinfo) 

If you are new to AWS Lambda a good place to start is [here](
http://docs.aws.amazon.com/lambda/latest/dg/getting-started.html)

# lambda-gdal_translate

This project allows you to run [gdal_translate](http://www.gdal.org/gdal_translate.html) utility using the [AWS Lambda](https://aws.amazon.com/lambda/) execution environment.
Generally it allows you run something that you would traditionally run as part of a batch file like this:

```bash
gdal_translate -b 1 -b 2 -b 3 -of GTiff -outsize 50% 50% -co tiled=yes -co BLOCKXSIZE=512 -co BLOCKYSIZE=512' -co PHOTOMETRIC=YCBCR -co COMPRESS=JPEG -co JPEG_QUALITY='85' input.tif output.tif
```
But from AWS Lambda. The difference you can do so in a highly parallel way, without much more than configuring the Lambda function's memory and timeout settings. What makes this possible at scale is that you are working with data in [Amazon S3](https://aws.amazon.com/s3), rather than a traditional file system. This example uses the USDA's NAIP data set. You can read more about the NAIP data, which is available as part of the AWS Earth on AWS collection, [here](https://aws.amazon.com/public-datasets/naip/).

## Usage

Runnig Lambda-gdal_translate looks like this:

```bash
aws lambda invoke --function-name gdal_translate --region us-east-1 --invocation-type Event --payload '{"sourceBucket": "aws-naip", "sourceObjectKey": "wi/2015/1m/rgbir/47090/m_4709061_sw_15_1_20150914.tif", "targetBucket": "youBucketNameHere", "targetPrefix": "temp-000"}' log
```

As you can see in this example, there are no gdal_translate arguments in the function invocation. That is because those arguments remain static over the course of a batch operation so are provided to the script as environment variables. In addition, because you often want to modify the output objects key name before you store it back to S3, you can define a find/replace string pair as environment variables to modify the output key name.

In order to process a large group of files in S3 it make sense to work off of a file list rather than repetitively listing objeccts in S3. The NAIP bucket, aws-naip, includes a manifest file at root, but lets assume you want to build your own. You can do this by using the AWS S3 CLI and the awk command. Note, this example uses "--request-payer requester" because the NAIP data is provided in a bucket that is marked [requester-pays](http://docs.aws.amazon.com/AmazonS3/latest/dev/RequesterPaysBuckets.html). You would not need it for your own data in S3.

```bash
aws s3 ls --recursive --request-payer requester s3://aws-naip/ca/2014/1m/rgbir | awk -F" " '{print $4}' > mylist
```
Your resulting list should look something like this:

```bash
cat mylist
ca/2014/1m/rgbir/42122/m_4212264_se_10_1_20140718.tif
ca/2014/1m/rgbir/42122/m_4212264_sw_10_1_20140718.tif
ca/2014/1m/rgbir/42123/m_4212360_se_10_1_20140622.tif
ca/2014/1m/rgbir/42123/m_4212360_sw_10_1_20140609.tif
...
```
You can process all of your source imagery using something like this:

```bash
cat mylist | awk -F"/" '{print "lambda invoke --function-name gdal_translate --region us-east-1 --invocation-type Event --payload \x27{\"sourceBucket\": \"aws-naip\",\"sourceObjectKey\": \""$0"\", \"targetBucket\": \"yourBucketNameHere\", \"targetPrefix\": \"yourPrefixHere\"}\x27 log" }'
```

that should result in output that looks like this:

```bash
lambda invoke --function-name gdal_translate --region us-east-1 --invocation-type Event --payload '{"sourceBucket": "aws-naip","sourceObjectKey": "ca/2014/1m/rgbir/42123/m_4212362_sw_10_1_20140622.tif", "targetBucket": "yourBucketNameHere", "targetPrefix": "yourPrefixHere"}' log
lambda invoke --function-name gdal_translate --region us-east-1 --invocation-type Event --payload '{"sourceBucket": "aws-naip","sourceObjectKey": "ca/2014/1m/rgbir/42123/m_4212363_se_10_1_20140622.tif", "targetBucket": "yourBucketNameHere", "targetPrefix": "yourPrefixHere"}' log
...
```

To test what you have, try running one of those lines by prepending the aws command like this:

```bash
aws lambda invoke --function-name gdal_translate --region us-east-1 --invocation-type Event --payload '{"sourceBucket": "aws-naip","sourceObjectKey": "ca/2014/1m/rgbir/42123/m_4212362_sw_10_1_20140622.tif", "targetBucket": "youBucketNameHere", "targetPrefix": "yourPrefixHere"}' log
```

Because you invoked it using the Event type you should see a HTTP 202 get returned.

Depending on the size of the raster file it will take a few seconds to process, but confirm that you have the expected result in your S3 bucket. Once satisfied with your results, you can speed things up (a lot) by piping to the xargs command like below.

```bash
cat mylist | awk -F"/" '{print "lambda invoke --function-name gdal_translate --region us-east-1 --invocation-type Event --payload \x27{\"sourceBucket\": \"aws-naip\",\"sourceObjectKey\": \""$0"\", \"targetBucket\": \"youBucketNameHere\", \"targetPrefix\": \"yourPrefixHere\"}\x27 log" }' | xargs -n 11 -P 64 aws
```

## Updating your own Amazon Lambda function

Make the changes you want to the file `index.js` and then package everything into a ZIP file:

```bash
$ zip -r -9 lambda-gdal_translate bin index.js
updating: bin/ (stored 0%)
updating: bin/gdal_translate (deflated 69%)
updating: index.js (deflated 61%)
```

From there you can upload the resulting ZIP file to Amazon Lambda via the console, or CLI:

```bash
$ aws lambda update-function-code --function-name gdal_translate --zip-file fileb://lambda-gdal_translate.zip
```

Then test it by using something like the single object example listed above.

## Statically Linked `gdal_translate`

You should be able to use the gdal_translate binary under /bin. However if you want a more recent version you need build a statically linked one on an Amazon Linux instance.

First, spin up an Amazon Linux instance on Amazon EC2 and run the following commands:

```bash
$ sudo yum update -y
$ sudo yum groupinstall -y "Development Tools"
$ sudo yum install -y libcurl-devel
$ wget http://download.osgeo.org/gdal/2.2.0/gdal-2.2.0.tar.gz
$ tar xzf gdal-2.2.0.tar.gz
$ cd gdal-2.2.0
$ ./configure --without-ld-shared --disable-shared --enable-static --with-curl --prefix /tmp/gdal
$ make
$ make install
$ rm -rf /tmp/gdal
```

Next, get a copy of the `gdal_translate` binary to your /bin directory. It is easiest to do this on the same EC2 instance you are testing the AWS Lambda function.

## Test

Once you have updated the Lambda function by uploading the zip file, which includes the gdal_translate binary, you can run a test either via CLI, or from the console. As in the example command line above, in order to run test it, you will need to provide the function a json formatted test event.

```bash
{"srcBucket": "korver.us.east.1","srcKey": "naip/or/2014/1m/rgbir/43124/m_4312447_se_10_1_20140604.tif", "targetBucket": "korver.us.east.1", "targetPrefix": "test/", "subSample": "50%", "compRate": "85"}
```

Success should result in a new compressed jpeg file located in your target bucket and under you target prefix.


