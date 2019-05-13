const {protocol} = require('electron');
const url = require('url');
const fs = require('fs');
const path = require('path');


let captchaPage = fs.readFileSync(path.join(__dirname, '..', 'public', 'html', 'captcha.html'), 'utf8');


module.exports = {
    callbackResponse: function (data) {
        // registerProtocol must be called before callback can set
        // so this is just a placeholder for the real callback function
        console.log(data);
    },
    registerScheme: function () {
        protocol.registerStandardSchemes(['cap']);
    },
    registerProtocol: function () {
        protocol.registerBufferProtocol('cap', (request, callback) => {
            let ReUrl = url.parse(request.url, true);
            if(ReUrl.query["g-recaptcha-response"])
            {
                let response = ReUrl.query["g-recaptcha-response"];
                this.callbackResponse(response);
            }
            callback({
                mimeType: 'text/html',
                data: Buffer.from(captchaPage)
            })
        }, (error) => {
            if (error) console.error('Failed to register protocol')
        })
    }
};
