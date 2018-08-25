var util = require("util");
var MetaDataBlock = require("./MetaDataBlock");

var MetaDataBlockStreamInfo = module.exports = function(isLast) {
  MetaDataBlock.call(this, isLast, 0);

  this.minBlockSize = 0;
  this.maxBlockSize = 0;
  this.minFrameSize = 0;
  this.maxFrameSize = 0;
  this.sampleRate = 0;
  this.channels = 0;
  this.bitsPerSample = 0;
  this.samples = 0;
  this.checksum = null;
  this.duration = 0;
  this.durationStr = "0:00.000";
}

util.inherits(MetaDataBlockStreamInfo, MetaDataBlock);

MetaDataBlockStreamInfo.prototype.remove = function() {
  console.error("WARNING: Can't remove StreamInfo block!");
}

MetaDataBlockStreamInfo.prototype.parse = function(buffer) {
  try {

    var pos = 0;

    this.minBlockSize = buffer.readUInt16BE(pos);
    this.maxBlockSize = buffer.readUInt16BE(pos + 2);
    this.minFrameSize = (buffer.readUInt8(pos + 4) << 16) | buffer.readUInt16BE(pos + 5);
    this.maxFrameSize = (buffer.readUInt8(pos + 7) << 16) | buffer.readUInt16BE(pos + 8);

    var tmp = buffer.readUInt32BE(pos + 10);
    this.sampleRate = tmp >>> 12;
    this.channels = (tmp >>> 9) & 0x07;
    this.bitsPerSample = (tmp >>> 4) & 0x1f;
    this.samples = +((tmp & 0x0f) << 4) + buffer.readUInt32BE(pos + 14);

    this.checksum = new Buffer(16);
    buffer.copy(this.checksum, 0, 18, 34);

    this.duration = this.samples / this.sampleRate;

    var minutes = "" + Math.floor(this.duration / 60);
    var seconds = pad(Math.floor(this.duration % 60), 2);
    var milliseconds = pad(Math.round(((this.duration % 60) - Math.floor(this.duration % 60)) * 1000), 3);
    this.durationStr = minutes + ":" + seconds + "." + milliseconds;

    this.hasData = true;

  }
  catch (e) {
    this.error = e;
    this.hasData = false;
  }
}

MetaDataBlockStreamInfo.prototype.toString = function() {
  var str = "[MetaDataBlockStreamInfo]";
  str += " type: " + this.type;
  str += ", isLast: " + this.isLast;
  if (this.error) {
    str += "\n  ERROR: " + this.error;
  }
  if (this.hasData) {
    str += "\n  minBlockSize: " + this.minBlockSize;
    str += "\n  maxBlockSize: " + this.maxBlockSize;
    str += "\n  minFrameSize: " + this.minFrameSize;
    str += "\n  maxFrameSize: " + this.maxFrameSize;
    str += "\n  samples: " + this.samples;
    str += "\n  sampleRate: " + this.sampleRate;
    str += "\n  channels: " + (this.channels + 1);
    str += "\n  bitsPerSample: " + (this.bitsPerSample + 1);
    str += "\n  duration: " + this.durationStr;
    str += "\n  checksum: " + (this.checksum ? this.checksum.toString("hex") : "<null>");
  }
  return str;
}

function pad(n, width) {
  n = "" + n;
  return (n.length >= width) ? n : new Array(width - n.length + 1).join("0") + n;
}
