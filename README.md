This is based on Hector Castro's [lambda-gdalinfo](https://github.com/hectcastro/lambda-gdalinfo) where he shows how to wrap gdalinfo using js to run on AWS Lambda.
If you are new to AWS Lambda, a good place to start is [here](
http://docs.aws.amazon.com/lambda/latest/dg/getting-started.html)
Also, there is an overview about running arbitrary executables [here](https://aws.amazon.com/blogs/compute/running-executables-in-aws-lambda/).

# lambda-gdal_translate

This project allows you to run the [gdal_translate](http://www.gdal.org/gdal_translate.html) utility using the [AWS Lambda](https://aws.amazon.com/lambda/) execution environment.
Generally, it allows you run a batch operation, one line of which might look like this,

```bash
gdal_translate -b 1 -b 2 -b 3 -of GTiff -outsize 50% 50% -co tiled=yes -co BLOCKXSIZE=512 -co BLOCKYSIZE=512' -co PHOTOMETRIC=YCBCR -co COMPRESS=JPEG -co JPEG_QUALITY='85' input.tif output.tif
```
but from AWS Lambda in a highly parallel, serverless way. Lambda makes it easy to access large amounts compute, but this script works in conjunction with [Amazon Simple Storage Service](https://aws.amazon.com/s3) (S3), serverless object storage, rather than data in a traditional file system, to make big geo-data processing accessible to anybody. This example uses the USDA's NAIP data set in the bucket aws-naip. The NAIP data is part of the AWS Earth on AWS collection, [here](https://aws.amazon.com/public-datasets/naip/).

## Statically Linked `gdal_translate`

You can use the gdal_translate binary under /bin. However if you want a more recent version you will need to build a statically linked one on an Amazon Linux instance for it work on AWS Lambda.

First, spin up an Amazon Linux instance on Amazon EC2. In the EC2 console it will look like "Amazon Linux AMI 2017.03.0 (HVM), SSD Volume".  Make sure you start the EC2 instance with an IAM role that will allow you to work with Lambda and S3. SSH to that instance and run the following commands:

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
gdal_translate binary will be under ~/gdal-2.2.0/apps with other gdal utility programs. Copy it to lamba-gdal_translate/bin/ location that you have git cloned.

## Setting up your blank Amazon Lambda function

Go to the console. Create a blank node.js 4.3 function.
Choose an existing Role : lambda_exec_role

Click on Advanced settings. This depends on the details of your data, but for the NAIP data (180MB per geotiff) you will want 320MB and timeout of about 30 seconds.

## Updating your own AWS Lambda function

Now that you have new binary you need to create a new deployment zip file package:

```bash
$ zip -r -9 lambda-gdal_translate bin index.js
updating: bin/ (stored 0%)
updating: bin/gdal_translate (deflated 69%)
updating: index.js (deflated 61%)
```
Now upload the resulting ZIP file to AWS Lambda like this or optionally use the Management Console.

```bash
$ aws lambda update-function-code --function-name gdal_translate --zip-file fileb://lambda-gdal_translate.zip
```

## Usage

Runnig or invoking lambda-gdal_translate looks like this:

```bash
aws lambda invoke --function-name gdal_translate --region us-east-1 --invocation-type Event --payload '{"sourceBucket": "aws-naip", "sourceObjectKey": "ri/2014/1m/rgbir/42071/m_4207160_se_19_1_20140718.tif", "targetBucket": "yourBucketNameHere", "targetPrefix": "yourPrefixHere"}' log
```

As you can see in this example, you are providing the Lambda function information about where to get and where to write the  data, there are no gdal_translate arguments in the function invocation. That is because those values remain static over the course of a batch operation, so are provided to the script as environment variables. In addition, because you often want to modify the output objects key name before you store it back to S3, you can define a find/replace string pair as environment variables to modify the output key name.

In order to process a large number of files in S3 it makes sense to work off a list, rather than repetitively listing objeccts in S3. The NAIP bucket includes a manifest file at root, but lets assume you want to build your own list. You can do this by using the AWS S3 CLI and the awk command. Note, this example includes "--request-payer requester" because the NAIP data is provided in a bucket that is marked that way. You can read more about requester-pays [here](http://docs.aws.amazon.com/AmazonS3/latest/dev/RequesterPaysBuckets.html). 

```bash
aws s3 ls --recursive --request-payer requester s3://aws-naip/ri/2014/1m/rgbir | grep tif | awk -F" " '{print $4}' > mylist
```
Your resulting list should look something like this:

```bash
cat mylist
ri/2014/1m/rgbir/42071/m_4207160_se_19_1_20140718.tif
ri/2014/1m/rgbir/42071/m_4207160_sw_19_1_20140718.tif
ri/2014/1m/rgbir/42071/m_4207161_se_19_1_20140718.tif
ri/2014/1m/rgbir/42071/m_4207161_sw_19_1_20140718.tif
...
```
You can process all of your source imagery using something like this:

```bash
cat mylist | awk -F"/" '{print "lambda invoke --function-name gdal_translate --region us-east-1 --invocation-type Event --payload \x27{\"sourceBucket\": \"aws-naip\",\"sourceObjectKey\": \""$0"\", \"targetBucket\": \"yourBucketNameHere\", \"targetPrefix\": \"yourPrefixHere\"}\x27 log" }'
```

which when run should result in output that looks like this:

```bash
lambda invoke --function-name gdal_translate --region us-east-1 --invocation-type Event --payload '{"sourceBucket": "aws-naip","sourceObjectKey": "ri/2014/1m/rgbir/42071/m_4207161_se_19_1_20140718.tif", "targetBucket": "youBucketNameHere", "targetPrefix": "yourPrefixHere"}' log
lambda invoke --function-name gdal_translate --region us-east-1 --invocation-type Event --payload '{"sourceBucket": "aws-naip","sourceObjectKey": "ri/2014/1m/rgbir/42071/m_4207161_sw_19_1_20140718.tif", "targetBucket": "youBucketNameHere", "targetPrefix": "yourPrefixHere"}' log
...
```
To test, try running one of these lines by prepending the aws command like this:

```bash
aws lambda invoke --function-name gdal_translate --region us-east-1 --invocation-type Event --payload '{"sourceBucket": "aws-naip","sourceObjectKey": "ri/2014/1m/rgbir/42071/m_4207161_sw_19_1_20140718.tif", "targetBucket": "youBucketNameHere", "targetPrefix": "yourPrefixHere"}' log
```

Because you invoked it using the Event type you should see a HTTP 202 get returned like this.

```
{
    "StatusCode": 202
}
```

Depending on the size of the raster file it will take a few seconds to process, but confirm that you have the expected result in your target S3 bucket. Once satisfied with your results, you can speed things up by piping to list to xargs and running in parallel mode using -P nn like this.

```bash
cat mylist | awk -F"/" '{print "lambda invoke --function-name gdal_translate --region us-east-1 --invocation-type Event --payload \x27{\"sourceBucket\": \"aws-naip\",\"sourceObjectKey\": \""$0"\", \"targetBucket\": \"youBucketNameHere\", \"targetPrefix\": \"yourPrefixHere\"}\x27 log" }' | xargs -n 11 -P 64 aws
```

## Console Test

Once you have updated the Lambda function by uploading the zip file, which includes the gdal_translate binary, you can run a test either via CLI, or from the console. As in the example command line above, in order to test it from the console, you will need to provide the function a json formatted test event.

```bash
{
  "sourceBucket": "aws-naip",
  "sourceObjectKey": "ri/2014/1m/rgbir/42071/m_4207161_sw_19_1_20140718.tif",
  "targetBucket": "youBucketNameHere",
  "targetPrefix": "yourPrefixHere"
}
```



