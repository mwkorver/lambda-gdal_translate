This is based on Hector Castro's [lambda-gdalinfo](https://github.com/hectcastro/lambda-gdalinfo) 

# lambda-gdal_translate

This project allows you to run [gdal_translate](http://www.gdal.org/gdal_translate.html) using the [AWS Lambda](https://aws.amazon.com/lambda/) execution environment.
Generally it allows you run something that you would traditionally run as part of a batch file like this:

```bash
gdal_translate -b 1 -b 2 -b 3 -of GTiff -outsize 50% 50% -co tiled=yes -co BLOCKXSIZE=512 -co BLOCKYSIZE=512' -co PHOTOMETRIC=YCBCR -co COMPRESS=JPEG -co JPEG_QUALITY='85' input.tif output.tif
```
but from AWS Lambda without much more than configuring the AWS Lambda function's memory and timeout settings. What makes this possible at scale is that your are working with data in [Amazon S3](https://aws.amazon.com/s3). It has been used to process 100s of thousands of files in the aws-naip S3 bucket from their original format into optimized RGB data residing under the prefix /rgb/100pct and /rgb/50pct. You can read more about the USDA's NAIP data, part of the AWS Earth on AWS collection [here](https://aws.amazon.com/public-datasets/naip/).

## Usage

An example command looks like the following:

```bash
aws lambda invoke --function-name gdal_translate --region us-east-1 --invocation-type Event --payload '{"sourceBucket": "aws-naip", "sourceObjectKey": "wi/2015/1m/rgbir/47090/m_4709061_sw_15_1_20150914.tif", "targetBucket": "youBucketNameHere", "targetPrefix": "temp-000"}' log
```

As you can see in the above example, there are no gdal_translate arguments in the Lambda function invocation. That is because those values typically remain static over a batch operation so are provided to the code as environment variables. Command line invocation simply requires source bucket and object key, target bucket and optional prefix. Because you often want to modify the resulting image objects key name before you store it back to S3, you can define a find/replace string pair as environment variables to modify the output key name.

In order to process a large group of files in S3 it make sense to work off of list off of list rather than repetively list objeccts in S3. The NAIP bucket, aws-naip, includes a manifest file at root, but lets assume you want to build your own. You can do this by using the AWS CLI and awk command.

```bash
aws s3 ls --recursive --request-payer requester s3://aws-naip/ca/2014/1m/rgbir | awk -F" " '{print $4}' > mylist
```

Your list should look something like this:

```bash
cat mylist
a/2014/1m/rgbir/42122/m_4212264_se_10_1_20140718.tif
ca/2014/1m/rgbir/42122/m_4212264_sw_10_1_20140718.tif
ca/2014/1m/rgbir/42123/m_4212360_se_10_1_20140622.tif
ca/2014/1m/rgbir/42123/m_4212360_sw_10_1_20140609.tif
...
```

You can process all of your source imagery using something like this:

```bash
cat mylist | awk -F"/" '{print "lambda invoke --function-name gdal_translate --region us-east-1 --invocation-type Event --payload \x27{\"sourceBucket\": \"aws-naip\",\"sourceObjectKey\": \""$0"\", \"targetBucket\": \"youBucketNameHere\", \"targetPrefix\": \"test-whatzz\"}\x27 log" }'
```

that should result in output that looks like this:

```bash
lambda invoke --function-name gdal_translate --region us-east-1 --invocation-type Event --payload '{"sourceBucket": "aws-naip","sourceObjectKey": "ca/2014/1m/rgbir/42123/m_4212362_sw_10_1_20140622.tif", "targetBucket": "youBucketNameHere", "targetPrefix": "yourPrefixHere"}' log
lambda invoke --function-name gdal_translate --region us-east-1 --invocation-type Event --payload '{"sourceBucket": "aws-naip","sourceObjectKey": "ca/2014/1m/rgbir/42123/m_4212363_se_10_1_20140622.tif", "targetBucket": "youBucketNameHere", "targetPrefix": "yourPrefixHere"}' log
lambda invoke --function-name gdal_translate --region us-east-1 --invocation-type Event --payload '{"sourceBucket": "aws-naip","sourceObjectKey": "ca/2014/1m/rgbir/42123/m_4212363_sw_10_1_20140622.tif", "targetBucket": "youBucketNameHere", "targetPrefix": "yourPrefixHere"}' log
...
```

To test what you have, try running one of those lines by prepending the aws command like this:

```bash
aws lambda invoke --function-name gdal_translate --region us-east-1 --invocation-type Event --payload '{"sourceBucket": "aws-naip","sourceObjectKey": "ca/2014/1m/rgbir/42123/m_4212362_sw_10_1_20140622.tif", "targetBucket": "youBucketNameHere", "targetPrefix": "yourPrefixHere"}' log
```

Confirm that you have the expected results in the S3 bucket you are using for ou tput by either using the S3 management console our your favorite S3 client.
Once satisfied with your results, you can speed up things up (a lot) by using 

```bash
| xargs -n 11 -P 64 aws
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


