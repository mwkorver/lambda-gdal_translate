# lambda-gdal_translate

This project allows you to run `gdal_translate` using the [Amazom Lambda](https://aws.amazon.com/lambda/) execution environment.

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

## Statically Linked `gdalinfo`

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

Next, download the `gdalinfo` binary from the machine using something like `sftp` and place it in the `bin` directory.

## Test

Using the testing functionality provided by Amazon Lambda, you should be able to send a test event to the function and see the following output in your logs:

```
START RequestId: 07a787b9-6255-11e5-922f-5d385943c862
2015-09-24T00:41:44.497Z    07a787b9-6255-11e5-922f-5d385943c862    Received event: {}
2015-09-24T00:41:45.337Z    07a787b9-6255-11e5-922f-5d385943c862    Driver: GTiff/GeoTIFF
Files: /vsicurl/https://s3.amazonaws.com/raster-foundry-tmp/356f564e3a0dc9d15553c17cf4583f21-5.tif
Size is 10015, 11232
Coordinate System is:
PROJCS["WGS 84 / UTM zone 45N",
    GEOGCS["WGS 84",
        DATUM["WGS_1984",
            SPHEROID["WGS 84",6378137,298.257223563,
                AUTHORITY["EPSG","7030"]],
            AUTHORITY["EPSG","6326"]],
        PRIMEM["Greenwich",0],
        UNIT["degree",0.0174532925199433],
        AUTHORITY["EPSG","4326"]],
    PROJECTION["Transverse_Mercator"],
    PARAMETER["latitude_of_origin",0],
    PARAMETER["central_meridian",87],
    PARAMETER["scale_factor",0.9996],
    PARAMETER["false_easting",500000],
    PARAMETER["false_northing",0],
    UNIT["metre",1,
        AUTHORITY["EPSG","9001"]],
    AUTHORITY["EPSG","32645"]]
Origin = (313168.470020892214961,3090755.517982613760978)
Pixel Size = (0.500000000000000,-0.500000000000000)
Metadata:
  AREA_OR_POINT=Area
  TIFFTAG_COPYRIGHT=Image Copyright 2015 DigitalGlobe Inc
  TIFFTAG_RESOLUTIONUNIT=1 (unitless)
  TIFFTAG_XRESOLUTION=1
  TIFFTAG_YRESOLUTION=1
Image Structure Metadata:
  INTERLEAVE=PIXEL
Corner Coordinates:
Upper Left  (  313168.470, 3090755.518) 
Lower Left  (  313168.470, 3085139.518) 
Upper Right (  318175.970, 3090755.518) 
Lower Right (  318175.970, 3085139.518) 
Center      (  315672.220, 3087947.518) 
Band 1 Block=512x512 Type=Byte, ColorInterp=Red
Band 2 Block=512x512 Type=Byte, ColorInterp=Green
Band 3 Block=512x512 Type=Byte, ColorInterp=Blue

END RequestId: 07a787b9-6255-11e5-922f-5d385943c862
REPORT RequestId: 07a787b9-6255-11e5-922f-5d385943c862  Duration: 840.76 ms Billed Duration: 900 ms     Memory Size: 128 MB Max Memory Used: 18 MB  
```
