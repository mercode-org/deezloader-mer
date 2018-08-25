# flac-metadata

A FLAC metadata processor for Node.js, implemented as Transform stream.

## Installation

```npm install flac-metadata```

## Usage Examples

Some simple examples to get you started:

#### Noop

Does nothing, just pipes a source FLAC through the Processor into a target FLAC.

```js
var fs = require("fs");
var flac = require("flac-metadata");

var reader = fs.createReadStream("source.flac");
var writer = fs.createWriteStream("target.flac");
var processor = new flac.Processor();

reader.pipe(processor).pipe(writer);
```

#### Trace Metadata

Traces out the metadata from a FLAC file.

```js
var fs = require("fs");
var flac = require("flac-metadata");

var reader = fs.createReadStream("source.flac");
var processor = new flac.Processor({ parseMetaDataBlocks: true });
processor.on("postprocess", function(mdb) {
  console.log(mdb.toString());
});

reader.pipe(processor);
```

The output should be something like this:

```
[MetaDataBlockStreamInfo] type: 0, isLast: false
  minBlockSize: 4096
  maxBlockSize: 4096
  minFrameSize: 14
  maxFrameSize: 12389
  samples: 9750804
  sampleRate: 44100
  channels: 2
  bitsPerSample: 16
  duration: 3:41.107
  checksum: 1746dff27beb6d1875a88cfeed8a576b

[MetaDataBlockVorbisComment] type: 4, isLast: false
  vendor: reference libFLAC 1.2.1 20070917
  comments:
    ALBUM: Close to the Glass
    ARTIST: The Notwist
    GENRE: Rock
    DATE: 2014
    TITLE: Signals

[MetaDataBlockPicture] type: 6, isLast: true
  pictureType: 3
  mimeType: image/png
  description:
  width: 120
  height: 120
  bitsPerPixel: 32
  colors: 0
  pictureData: 391383
```

#### Strip All Metadata

Pipes a source FLAC through the Processor into a target FLAC, removing all metadata.

```js
var fs = require("fs");
var flac = require("flac-metadata");

var reader = fs.createReadStream("source.flac");
var writer = fs.createWriteStream("target.flac");
var processor = new flac.Processor();

processor.on("preprocess", function(mdb) {
  // STREAMINFO is always the first (and only mandatory) metadata block.
  if (mdb.type === flac.Processor.MDB_TYPE_STREAMINFO) {
    // When a metadata block's isLast flag is set to true in preprocess,
    // subsequent blocks are automatically discarded.
    mdb.isLast = true;
  }
});

reader.pipe(processor).pipe(writer);
```

#### Inject Metadata

Injects a VORBIS_COMMENT block (and removes the existing one, if any).

```js
var fs = require("fs");
var flac = require("flac-metadata");

var reader = fs.createReadStream("source.flac");
var writer = fs.createWriteStream("target.flac");
var processor = new flac.Processor();

var vendor = "reference libFLAC 1.2.1 20070917";
var comments = [
  "ARTIST=Boyracer",
  "TITLE=I've Got It And It's Not Worth Having",
  "ALBUM=B Is For Boyracer",
  "TRACKNUMBER=A1",
  "DATE=1993",
  "DISCOGS=22379"
];

processor.on("preprocess", function(mdb) {
  // Remove existing VORBIS_COMMENT block, if any.
  if (mdb.type === flac.Processor.MDB_TYPE_VORBIS_COMMENT) {
    mdb.remove();
  }
  // Inject new VORBIS_COMMENT block.
  if (mdb.removed || mdb.isLast) {
    var mdbVorbis = flac.data.MetaDataBlockVorbisComment.create(mdb.isLast, vendor, comments);
    this.push(mdbVorbis.publish());
  }
});

reader.pipe(processor).pipe(writer);
```

## License

MIT
