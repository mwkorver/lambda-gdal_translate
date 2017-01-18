This is based on Hector Castro's [lambda-gdal](https://github.com/hectcastro/lambda-gdalinfo)
# lambda-gdal_translate

This project allows you to run [gdal_translate](http://www.gdal.org/gdal_translate.html) using the [Amazon Lambda](https://aws.amazon.com/lambda/) execution environment.

## Usage

An example command looks like the following:

```bash
aws lambda invoke --function-name gdal_translate --region us-east-1 --invocation-type Event --payload '{"srcBucket": "korver.us.east.1","srcKey": "naip/or/2014/1m/rgbir/43124/m_4312447_se_10_1_20140604.tif", "targetBucket": "korver.us.east.1", "targetPrefix": "test/", "subSample": "50%", "compRate": "85"}' log
```

The code supports just a small subset of gdal_translate's feature set. It reads json that contains source bucket, object key, output bucket, output prefix, subsample rate, and compression rate to produce a internally tiled, jpeg comressed geotiff file.

In order to process a group of files you would build above example command by catting an existing list of target files.
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

Make whatever changes are necessary to `index.js` and then package everything into a ZIP file:

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

In order for Lambda to be able to run the gdal_translate binary you need build a statically link one on an Amazon Linux instance.

First, spin up an Amazon Linux instance on Amazon EC2 and execute the following commands:

```bash
$ sudo yum update -y
$ sudo yum groupinstall -y "Development Tools"
$ sudo yum install -y libcurl-devel
$ wget http://download.osgeo.org/gdal/1.11.2/gdal-1.11.2.tar.gz
$ tar xzf gdal-1.11.2.tar.gz
$ cd gdal-1.11.2
$ ./configure --without-ld-shared --disable-shared --enable-static --with-curl --prefix /tmp
$ make
$ make install
```

Next, download the `gdal_translate` binary from the machine. I typically use AWS S3 CLI to move files around between machines.

## Test

Once you have uploaded the zip file, which includes the gdal_translate binary, you can run a test either via CLI, or from the console. As in the example command line above, in order to run it from the console, you will need to provide the function a json formatted test event.

```
{"srcBucket": "korver.us.east.1","srcKey": "naip/or/2014/1m/rgbir/43124/m_4312447_se_10_1_20140604.tif", "targetBucket": "korver.us.east.1", "targetPrefix": "test/", "subSample": "50%", "compRate": "85"}
...

```
