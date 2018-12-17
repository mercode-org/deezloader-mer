const crypto = require('crypto')

function md5 (data, type = 'binary') {
  let md5sum = crypto.createHash('md5')
  md5sum.update(new Buffer(data, type))
  return md5sum.digest('hex')
}

function ecbCrypt (key, data) {
  let cipher = crypto.createCipheriv("aes-128-ecb", new Buffer(key), new Buffer(""));
  return Buffer.concat([cipher.update(data, 'binary'), cipher.final()]).toString("hex").toLowerCase();
}

function getBlowfishKey(trackId) {
	var SECRET = 'g4el58wc'+'0zvf9na1';
	var idMd5 = md5(trackId.toString(), 'ascii')
	var bfKey = ''
	for (let i = 0; i < 16; i++) {
		bfKey += String.fromCharCode(idMd5.charCodeAt(i) ^ idMd5.charCodeAt(i + 16) ^ SECRET.charCodeAt(i))
	}
	return bfKey;
}

function decryptChunk(chunk, blowFishKey){
  var cipher = crypto.createDecipheriv('bf-cbc', blowFishKey, Buffer.from([0, 1, 2, 3, 4, 5, 6, 7]))
  cipher.setAutoPadding(false)
  return cipher.update(chunk, 'binary', 'binary') + cipher.final()
}

module.exports = {
  md5: md5,
  ecbCrypt: ecbCrypt,
  getBlowfishKey: getBlowfishKey,
  decryptChunk: decryptChunk
}
