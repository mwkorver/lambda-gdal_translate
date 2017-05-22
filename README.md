This is based on Hector Castro's [lambda-gdalinfo](https://github.com/hectcastro/lambda-gdalinfo) where he shows how to wrap gdalinfo to run on AWS Lambda.
There is an overview on running arbitrary executables on AWS Lambda [here](https://aws.amazon.com/blogs/compute/running-executables-in-aws-lambda/).
### Note this script does not use /vsis3/ to allow gdal_translate to read S3 directly. Rather it is generic so that it should be useful for other executables.

# lambda-gdal_translate

This script allows you to run the [gdal_translate](http://www.gdal.org/gdal_translate.html) utility using the [AWS Lambda](https://aws.amazon.com/lambda/) execution environment.
Generally, it allows you run a batch operation, a single line of which might look like this,

```bash
gdal_translate -b 1 -b 2 -b 3 -of GTiff -outsize 50% 50% -co tiled=yes -co BLOCKXSIZE=512 -co BLOCKYSIZE=512' -co PHOTOMETRIC=YCBCR -co COMPRESS=JPEG -co JPEG_QUALITY='85' input.tif output.tif
```
but using AWS Lambda, in a serverless way. The general idea is that running on Lambda allows what would typically run on a constrained number of workstation cores, run as many execution threads close to your data. Lambda makes it easy to access large amounts compute, but compute alone is not enough. This script works in conjunction with [Amazon Simple Storage Service](https://aws.amazon.com/s3) (S3), rather than a traditional file system, to make big geo-data processing accessible to anybody. This example uses the USDA NAIP data set, which is part of the AWS Earth on AWS collection, [here](https://aws.amazon.com/earth/). 

## Getting Started

Start an Amazon Linux instance on Amazon EC2. Make sure you start the EC2 instance with an IAM role that will allow you to work with Lambda, read from S3 and write to at least one of your own S3 buckets. SSH to that instance and clone this repository.

```bash
$ git clone https://github.com/mwkorver/lambda-gdal_translate.git
```

## Statically Linked `gdal_translate`

This repository already includes the gdal_translate binary. Let's assume you want a more recent version. To run exectables on Lambda it needs to be compiled in way such that it will run in a stand-alone fashion or built for the matching version of Amazon Linux. GDAL downloads are [here](https://trac.osgeo.org/gdal/wiki/DownloadSource).

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
Once this done, you can find the gdal_translate binary under ~/gdal-2.2.0/apps along with other gdal utility programs. Copy it to lamba-gdal_translate/bin/ location replacing the one there.

## Setup a blank AWS Lambda function

You can create your new Lambda function from the commandline, but because we also need to add a few environment variables it's easier to use the console to get this started.
Go to the console. Create a function, choose 'Blank Function', don't configure a trigger.
In the "Configure function" section use these values

```
Name:      lambda-gdal_translate 
Runtime:   Node.js 4.3  
```

Add the following enviroment variables.

| Key           | Value         | 
| ------------- |:-------------| 
| gdalArgs      |  -b 1 -b 2 -b 3 -of GTiff -outsize 25% 25% -co tiled=yes -co BLOCKXSIZE=512 -co BLOCKYSIZE=512 -co PHOTOMETRIC=YCBCR -co COMPRESS=JPEG -co JPEG_QUALITY=85 |
| findVal       | rgbir      | 
| replaceVal    | rgb/25pct      | 

Under the "Lambda function handler and role" section.

```
Handler:         index.handler
Role:            Choose an Existing Role
Existing Role:   lambda_exec_role
``` 
Expand Advanced settings. These NAIP files are not small.

```
Memory (MB):     384
Timeout:         30 seconds
```

## Updating your own AWS Lambda function

If you overwrote the gdal_translate binary under /bin, you need to create a new deployment file package:

```bash
$ zip -r -9 lambda-gdal_translate bin index.js
updating: bin/ (stored 0%)
updating: bin/gdal_translate (deflated 69%)
updating: index.js (deflated 61%)
```
Now update your blank Lambda function by uploading the resulting ZIP file like this or optionally use the Management Console.

```bash
$ aws lambda update-function-code --function-name gdal_translate --zip-file fileb://lambda-gdal_translate.zip
```

## Usage

Runnig or invoking lambda-gdal_translate looks like this:

```bash
$ aws lambda invoke --function-name gdal_translate --region us-east-1 --invocation-type Event --payload '{"sourceBucket": "aws-naip", "sourceObjectKey": "wi/2015/1m/rgbir/47090/m_4709061_sw_15_1_20150914.tif", "targetBucket": "yourBucketNameHere", "targetPrefix": "yourPrefixHere"}' log
```

As you can see in this example, you are providing the Lambda function information about where to get data and where to write the result data, there are no gdal_translate arguments in the function invocation itself. That is because those values remain static over the course of a batch operation, so are provided to the script as environment variables. In addition, because you often want to modify the output objects key name before you store it back to S3, you can define a find/replace string pair as environment variables to modify the output key name before the write operation.

In order to process a large group of files in S3 it makes sense to work off of a list of S3 objects rather than repetitively listing objeccts in S3. The NAIP bucket includes a manifest file at root, but lets assume you want to build your own list. You can do this by using the AWS S3 CLI and the awk command. Note, this example uses "--request-payer requester" because the NAIP data is provided in a bucket that is setup that way. You can read more about requester-pays [here](http://docs.aws.amazon.com/AmazonS3/latest/dev/RequesterPaysBuckets.html). 

Try this with Rhode Island (ri) data.

```bash
$ aws s3 ls --recursive --request-payer requester s3://aws-naip/ri/2014/1m/rgbir 
$ aws s3 ls --recursive --request-payer requester s3://aws-naip/ri/2014/1m/rgbir | awk -F" " '{print $4}' 
```
Then run this to create a list.

```bash
$ aws s3 ls --recursive --request-payer requester s3://aws-naip/ri/2014/1m/rgbir | awk -F" " '{print $4}' > mylist
```
Your resulting list should look something like this:

```bash
$ cat mylist
ri/2014/1m/rgbir/41071/m_4107152_sw_19_1_20140718.tif
ri/2014/1m/rgbir/42071/m_4207158_se_19_1_20140712.tif
ri/2014/1m/rgbir/42071/m_4207159_se_19_1_20140718.tif
ri/2014/1m/rgbir/42071/m_4207159_sw_19_1_20140718.tif
ri/2014/1m/rgbir/42071/m_4207160_se_19_1_20140718.tif
...
```
You can process all of your source imagery using something like this:

```bash
$ cat mylist | awk -F"/" '{print "lambda invoke --function-name gdal_translate --region us-east-1 --invocation-type Event --payload \x27{\"sourceBucket\": \"aws-naip\",\"sourceObjectKey\": \""$0"\", \"targetBucket\": \"yourBucketNameHere\", \"targetPrefix\": \"yourPrefixHere\"}\x27 log" }'
```
For this to work with your S3 bucket, at minimum you need to change "yourBucketNameHere".

That should result in output that looks like this:

```bash
lambda invoke --function-name gdal_translate --region us-east-1 --invocation-type Event --payload '{"sourceBucket": "aws-naip","sourceObjectKey": "ri/2014/1m/rgbir/42071/m_4207160_sw_19_1_20140718.tif", "targetBucket": "yourBucketNameHere", "targetPrefix": "yourPrefixHere"}' log
lambda invoke --function-name gdal_translate --region us-east-1 --invocation-type Event --payload '{"sourceBucket": "aws-naip","sourceObjectKey": "ri/2014/1m/rgbir/42071/m_4207161_se_19_1_20140718.tif", "targetBucket": "yourBucketNameHere", "targetPrefix": "yourPrefixHere"}' log
lambda invoke --function-name gdal_translate --region us-east-1 --invocation-type Event --payload '{"sourceBucket": "aws-naip","sourceObjectKey": "ri/2014/1m/rgbir/42071/m_4207161_sw_19_1_20140718.tif", "targetBucket": "yourBucketNameHere", "targetPrefix": "yourPrefixHere"}' log
...
```

## Test

To test what you have, try running one of those lines by prepending the aws command like this:

```bash
$ aws lambda invoke --function-name gdal_translate --region us-east-1 --invocation-type Event --payload '{"sourceBucket": "aws-naip","sourceObjectKey": "ri/2014/1m/rgbir/42071/m_4207161_sw_19_1_20140718.tif", "targetBucket": "yourBucketNameHere", "targetPrefix": "yourPrefixHere"}' log
```

Because you invoked it using the Event type you should see an HTTP 202 get returned like this.

```bash
{
    "StatusCode": 202
}
```

You can run a test either via CLI, or from the Amazon Managemet Console. As in the example command line above, in order to run test it, you will need to provide the function a json formatted test event.

```bash
{
  "sourceBucket": "aws-naip",
  "sourceObjectKey": "ca/2014/1m/rgbir/42123/m_4212364_sw_10_1_20140623.tif",
  "targetBucket": "yourBucketNameHere",
  "targetPrefix": "yourPrefixHere"
}
```

Depending on the size of the raster file it will take a few seconds to process, but confirm that you have the expected result in your target S3 bucket. 

You can check on your result by using gdalinfo

```bash
$ aws s3 ls --recursive --request-payer requester s3://yourBucketNameHere/yourPrefixHere
$ aws s3 cp s3://yourBucketNameHere/yourPrefixHere/ri/2014/1m/rgbir/42071/m_4207161_sw_19_1_20140718.tif test.tif
$ ./gdal-2.2.0/apps/gdalinfo test.tif
```

## Pleasingly Parallel

Once satisfied with your results, you can speed things up by piping to  xargs and running in parallel mode using -P nn.

```bash
$ cat mylist | awk -F"/" '{print "lambda invoke --function-name gdal_translate --region us-east-1 --invocation-type Event --payload \x27{\"sourceBucket\": \"aws-naip\",\"sourceObjectKey\": \""$0"\", \"targetBucket\": \"youBucketNameHere\", \"targetPrefix\": \"yourPrefixHere\"}\x27 log" }' | xargs -n 11 -P 64 aws
```




