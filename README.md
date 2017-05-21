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
aws lambda invoke --function-name gdal_translate --region us-east-1 --invocation-type Event --payload '{"sourceBucket": "aws-naip", "sourceObjectKey": "wi/2015/1m/rgbir/47090/m_4709061_sw_15_1_20150914.tif", "targetBucket": "korver.us.east.1", "targetPrefix": "temp-000"}' log
```

As you can see in the above example, there are no gdal_translate arguments in the Lambda function invocation. That is because those values typically remain static over a batch operation so are provided to the code as environment variables. Command line invocation simply requires source bucket and object key, target bucket and optional prefix. Because you often want to modify the resulting image objects key name before you store it back to S3, you can define a find/replace string pair as environment variables to modify the output key name.

In order to process a group of files you would build the above example command by cating an existing list of target files.
Assuming you have list of S3 object keys that look like this:

```bash
cat geotifs
naip/or/2014/1m/rgbir/46123/m_4612363_ne_10_1_20140630.tif
naip/or/2014/1m/rgbir/46123/m_4612363_nw_10_1_20140710.tif
```

You can process all of your source imagery using something like this:

```bash
cat geotifs | awk -F"/" '{print "lambda invoke --function-name gdal_translate --region us-east-1 --invocation-type Event --payload \x27{\"srcBucket\": \"korver.us.east.1\",\"srcKey\": \""$0"\", \"targetBucket\": \"korver.us.east.1\", \"targetPrefix\": \"test-20161201-02/50/\", \"subSample\": \"50%\", \"compRate\": \"85\"}\x27 log" }' | xargs -n 11 -P 64 aws
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


