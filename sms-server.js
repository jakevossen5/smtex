var fs = require('fs')
var bodyParser = require('body-parser')
const express = require('express');
const MessagingResponse = require('twilio').twiml.MessagingResponse;

const app = express();

app.use(bodyParser.urlencoded( {extended: false} ));
app.use(express.json());
app.post('/sms', (req, res) => {
  const twiml = new MessagingResponse();
  const message = req.body.Body.trim()
  console.log(req.body)
  var pdata = {
    "format": "TeX",
    "math": message,
    "svg":true,
    "mml":false,
    "png":true,
    "speakText": true,
    "speakRuleset": "mathspeak",
    "speakStyle": "default",
    "ex": 6,
    "width": 1000000,
    "linebreaks": false,
    "number": req.body.From
};
var datastring = JSON.stringify(pdata);

var options = {
  'hostname': 'localhost',
  'port': 8003,
  'path': '/',
  'method': 'POST',
  'headers': {
    'Content-Type': 'application/json',
    'Content-Length': datastring.length
    }
};

var request = http.request(options, function(response){
    response.setEncoding('utf-8');
    var body = '';
    response.on('data', function(data){body += data;});
    response.on('end', function(){
        fs.writeFile('out.png', body, function(err){
		if(err){
			console.log(err)
	}});
    });
});

request.on('error', function(e) {
  console.log('problem with request: ' + e.message);
});

request.write(datastring);
console.log(datastring);
request.end(); 

  res.writeHead(200, {'Content-Type': 'text/xml'});
  res.end(twiml.toString());
});

http.createServer(app).listen(1337, () => {
  console.log('Express server listening on port 1337');
});
