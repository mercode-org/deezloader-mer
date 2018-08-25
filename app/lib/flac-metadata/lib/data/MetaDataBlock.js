var MetaDataBlock = module.exports = function(isLast, type) {
  this.isLast = isLast;
  this.type = type;
  this.error = null;
  this.hasData = false;
  this.removed = false;
}

MetaDataBlock.prototype.remove = function() {
  this.removed = true;
}

MetaDataBlock.prototype.parse = function(buffer) {
}

MetaDataBlock.prototype.toString = function() {
  var str = "[MetaDataBlock]";
  str += " type: " + this.type;
  str += ", isLast: " + this.isLast;
  return str;
}
