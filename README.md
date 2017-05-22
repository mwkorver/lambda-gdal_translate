This is based on Hector Castro's [lambda-gdalinfo](https://github.com/hectcastro/lambda-gdalinfo) where he shows how to wrap gdalinfo using js to run on AWS Lambda.
There is an overview on running arbitrary executables on AWS Lambda [here](https://aws.amazon.com/blogs/compute/running-executables-in-aws-lambda/).

# lambda-gdal_translate

This project allows you to run the [gdal_translate](http://www.gdal.org/gdal_translate.html) utility using the [AWS Lambda](https://aws.amazon.com/lambda/) execution environment.
Generally, it allows you run a batch operation, a single line of which might look like this,

```bash
gdal_translate -b 1 -b 2 -b 3 -of GTiff -outsize 50% 50% -co tiled=yes -co BLOCKXSIZE=512 -co BLOCKYSIZE=512' -co PHOTOMETRIC=YCBCR -co COMPRESS=JPEG -co JPEG_QUALITY='85' input.tif output.tif
```
but from AWS Lambda in a highly parallel and serverless way. Lambda makes it easy to access large amounts compute, but compute alone is not enough. This script works in conjunction with [Amazon Simple Storage Service](https://aws.amazon.com/s3) (S3), rather than a traditional file system, to make big geo-data processing accessible to anybody. This example uses the USDA NAIP data set, part of the AWS Earth on AWS collection, [here](https://aws.amazon.com/public-datasets/naip/). 

## Statically Linked `gdal_translate`

Start an Amazon Linux instance on Amazon EC2. In the EC2 console it should look like "Amazon Linux AMI 2017.03.0 (HVM), SSD Volume".  Make sure you start the EC2 instance with an IAM role that will allow you to work with Lambda and S3. SSH to that instance and run the following commands:

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
You can find the gdal_translate binary under ~/gdal-2.2.0/apps along with other gdal utility programs. Copy it to lamba-gdal_translate/bin/ location replacing the one there.

## Setup a blank Amazon Lambda function

You can create your new Lambda function from the commandline, but because we also need to add a few environment variables it's easier to use the console to get this started.
Go to the console. Create a function, choose 'Blank Function', don't configure a trigger.
In the "Configure function" section use these values

```
Name:      lambda-gdal_translate 
Runtime:   Node.js 4.3  
```

Then add the following enviromental variables

| Key           | Value         | 
| ------------- |:-------------| 
| gdalArgs      |  -b 1 -b 2 -b 3 -of GTiff -outsize 50% 50% -co tiled=yes -co BLOCKXSIZE=512 -co BLOCKYSIZE=512 -co PHOTOMETRIC=YCBCR -co COMPRESS=JPEG -co JPEG_QUALITY=85 |
| findVal       | rgbir      | 
| replaceVal    | rgb/50pct      | 

Under the "Lambda function handler and role" section.

```
Handler:         index.handler
Role:            Choose an Existing Role
Existing Role:   lambda_exec_role
``` 
Expand Advanced settings. These NAIP files are not small.

```
Memory (MB):     320
Timeout:         1 min
```

## Updating your own Amazon Lambda function

If you overwrote the gdal_translate binary you need to create a new deployment file package:

```bash
$ zip -r -9 lambda-gdal_translate bin index.js
updating: bin/ (stored 0%)
updating: bin/gdal_translate (deflated 69%)
updating: index.js (deflated 61%)
```
Now upload the resulting ZIP file to Amazon Lambda like this or optionally use the Management Console.

```bash
$ aws lambda update-function-code --function-name gdal_translate --zip-file fileb://lambda-gdal_translate.zip
```

## Usage

Runnig or invoking lambda-gdal_translate looks like this:

```bash
aws lambda invoke --function-name gdal_translate --region us-east-1 --invocation-type Event --payload '{"sourceBucket": "aws-naip", "sourceObjectKey": "wi/2015/1m/rgbir/47090/m_4709061_sw_15_1_20150914.tif", "targetBucket": "yourBucketNameHere", "targetPrefix": "yourPrefixHere"}' log
```

As you can see in this example, you are providing the Lambda function information about where to get data and where to write the result data, there are no gdal_translate arguments in the function invocation. That is because those values remain static over the course of a batch operation, so are provided to the script as environment variables. In addition, because you often want to modify the output objects key name before you store it back to S3, you can define a find/replace string pair as environment variables to modify the output key name.


In order to process a large group of files in S3 it makes sense to work off of a file list rather than repetitively listing objeccts in S3. The NAIP bucket includes a manifest file at root, but lets assume you want to build your own list. You can do this by using the AWS S3 CLI and the awk command. Note, this example uses "--request-payer requester" because the NAIP data is provided in a bucket that is marked that way. You can read more about requester-pays [here](http://docs.aws.amazon.com/AmazonS3/latest/dev/RequesterPaysBuckets.html). 

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

Depending on the size of the raster file it will take a few seconds to process, but confirm that you have the expected result in your target S3 bucket. Once satisfied with your results, you can speed things up by piping to  xargs and running in parallel mode using -P nn.

```bash
cat mylist | awk -F"/" '{print "lambda invoke --function-name gdal_translate --region us-east-1 --invocation-type Event --payload \x27{\"sourceBucket\": \"aws-naip\",\"sourceObjectKey\": \""$0"\", \"targetBucket\": \"youBucketNameHere\", \"targetPrefix\": \"yourPrefixHere\"}\x27 log" }' | xargs -n 11 -P 64 aws
```


## Test

Once you have updated the Lambda function by uploading the zip file, which includes the gdal_translate binary, you can run a test either via CLI, or from the console. As in the example command line above, in order to run test it, you will need to provide the function a json formatted test event.

```bash
{
  "sourceBucket": "aws-naip",
  "sourceObjectKey": "ca/2014/1m/rgbir/42123/m_4212364_sw_10_1_20140623.tif",
  "targetBucket": "youBucketNameHere",
  "targetPrefix": "yourPrefixHere"
}
```

Success should result in a new compressed jpeg file located in your target bucket and under you target prefix.

