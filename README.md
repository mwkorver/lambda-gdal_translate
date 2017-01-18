This is based on Hector Castro's [lambda-gdal](https://github.com/hectcastro/lambda-gdalinfo)
# lambda-gdal_translate

This project allows you to run [gdal_translate](http://www.gdal.org/gdal_translate.html) using the [Amazon Lambda](https://aws.amazon.com/lambda/) execution environment.

## Usage

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

## Statically Linked `gdal_translate`

The resulting `gdalinfo` binary isn't completely statically linked because of `libcurl`, but it's close.

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

Next, download the `gdal_translate` binary from the machine. I typically used AWS S3 CLI to move files around between machines.

## Test

Using the testing functionality provided by Amazon Lambda, you should be able to send a test event to the function and see the following output in your logs:

```


```
