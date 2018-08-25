var util = require("util");
var MetaDataBlock = require("./MetaDataBlock");

var MetaDataBlockVorbisComment = module.exports = function(isLast) {
  MetaDataBlock.call(this, isLast, 4);

  this.vendor = "";
  this.comments = [];
}

util.inherits(MetaDataBlockVorbisComment, MetaDataBlock);

MetaDataBlockVorbisComment.create = function(isLast, vendor, comments) {
  var mdb = new MetaDataBlockVorbisComment(isLast);
  mdb.vendor = vendor;
  mdb.comments = comments;
  mdb.hasData = true;
  return mdb;
}

MetaDataBlockVorbisComment.prototype.parse = function(buffer) {
  try {

    var pos = 0;

    var vendorLen = buffer.readUInt32LE(pos);
    var vendor = buffer.toString("utf8", pos + 4, pos + 4 + vendorLen);
    this.vendor = vendor;
    pos += 4 + vendorLen;

    var commentCount = buffer.readUInt32LE(pos);
    pos += 4;

    while (commentCount-- > 0) {
      var commentLen = buffer.readUInt32LE(pos);
      var comment = buffer.toString("utf8", pos + 4, pos + 4 + commentLen);
      this.comments.push(comment);
      pos += 4 + commentLen;
    }

    this.hasData = true;

  }
  catch (e) {
    this.error = e;
    this.hasData = false;
  }
}

MetaDataBlockVorbisComment.prototype.publish = function() {
  var pos = 0;
  var size = this.getSize();
  var buffer = new Buffer(4 + size);

  var header = size;
  header |= (this.type << 24);
  header |= (this.isLast ? 0x80000000 : 0);
  buffer.writeUInt32BE(header >>> 0, pos);
  pos += 4;

  var vendorLen = Buffer.byteLength(this.vendor);
  buffer.writeUInt32LE(vendorLen, pos);
  buffer.write(this.vendor, pos + 4);
  pos += 4 + vendorLen;

  var commentCount = this.comments.length;
  buffer.writeUInt32LE(commentCount, pos);
  pos += 4;

  for (var i = 0; i < commentCount; i++) {
    var comment = this.comments[i];
    var commentLen = Buffer.byteLength(comment);
    buffer.writeUInt32LE(commentLen, pos);
    buffer.write(comment, pos + 4);
    pos += 4 + commentLen;
  }

  return buffer;
}

MetaDataBlockVorbisComment.prototype.getSize = function() {
  var size = 8 + Buffer.byteLength(this.vendor);
  for (var i = 0; i < this.comments.length; i++) {
    size += 4 + Buffer.byteLength(this.comments[i]);
  }
  return size;
}

MetaDataBlockVorbisComment.prototype.toString = function() {
  var str = "[MetaDataBlockVorbisComment]";
  str += " type: " + this.type;
  str += ", isLast: " + this.isLast;
  if (this.error) {
    str += "\n  ERROR: " + this.error;
  }
  if (this.hasData) {
    str += "\n  vendor: " + this.vendor;
    if (this.comments.length) {
      str += "\n  comments:";
      for (var i = 0; i < this.comments.length; i++) {
        str += "\n    " + this.comments[i].split("=").join(": ");
      }
    } else {
      str += "\n  comments: none";
    }
  }
  return str;
}
