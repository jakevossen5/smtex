var cluster = require('cluster');
var http = require('http');
var numCPUs = require('os').cpus().length;
var fs = require('fs')
var AWS = require('aws-sdk')
var uuidv4 = require('uuid/v4')
var twilio = require('twilio')
var svgexport = require('svgexport')

function startMathJax(){
    console.log("started mathjax")
    var mjAPI = require("mathjax-node-sre");
    mjAPI.config({
        MathJax: {
            SVG: {
                font: "STIX-Web"
            },
            tex2jax: {
                preview: ["[math]"],
                processEscapes: true,
                processClass: ['math'],
//                inlineMath: [ ['$','$'], ["\\(","\\)"] ],
//                displayMath: [ ['$$','$$'], ["\\[","\\]"] ],
                skipTags: ["script","noscript","style","textarea","pre","code"]
            },
            TeX: {
                noUndefined: {disabled: true},
                Macros: {
                  mbox: ['{\\text{#1}}',1],
                  mb: ['{\\mathbf{#1}}',1],
                  mc: ['{\\mathcal{#1}}',1],
                  mi: ['{\\mathit{#1}}',1],
                  mr: ['{\\mathrm{#1}}',1],
                  ms: ['{\\mathsf{#1}}',1],
                  mt: ['{\\mathtt{#1}}',1]
                }
            }
        }
    });
    mjAPI.start();
    return mjAPI;
}

function handleRequest(mjAPI, request, response){
    console.log("started handleRequest")
    var str_params = '';
    request.on('data', function(chunk){str_params += chunk;});
    console.log("after request.on('data")
    request.on('end', function(){
		var params = JSON.parse(str_params);
	        console.log("params" + params)

		mjAPI.typeset(params, function(result){
			if (!result.errors) {
				if (params.svg) {
					var uuid = uuidv4();
					jpg_name = uuid.substring(0,8) + '.jpg';
					svg_name = uuid.substring(0,8) + '.svg';
					
					// save svg to a file
					fs.writeFileSync("/tmp/" + svg_name, result.svg);

					// touch jpg file to make sure it exists
					fs.writeFileSync('/tmp/' + jpg_name);

					// convert svg to jpg
					datafile = {
						'input': ['/tmp/' + svg_name, 'svg{background:white;}'],
						'output': ['/tmp/' + jpg_name]
					}
					svgexport.render(datafile, function(err){
						if(err){
							console.log(err);
						}
						
						//fs.writeFileSync(jpg_name);

						console.log('Saved jpg of latex as /tmp/' + jpg_name);

						response.writeHead(200, {'Content-Type': 'image/jpeg'});
						response.end(fs.readFileSync('/tmp/' + jpg_name));
						thePng = fs.readFileSync('/tmp/'+jpg_name);

						var imagedata = {
							Bucket: "smtex.me", 
							Key: 'f/' + jpg_name, 
							StorageClass: "REDUCED_REDUNDANCY",
							Body: thePng,
							ContentType: 'image/jpeg',
							ACL: 'public-read'
						};

						var s3 = new AWS.S3();

						s3.putObject(imagedata, function(err, imagedata){
							if (err) { 
								console.log(err);
								console.log('Error uploading data: ', imagedata); 
							} else {
								console.log('Saved PNG of latex equation to s3 as ' + jpg_name);
							}
						});
						var accountSid = 'ACCOUNTSID'; // Your Account SID from www.twilio.com/console
						var authToken = 'AUTHTOKEN';   // Your Auth Token from www.twilio.com/console

						var client = new twilio(accountSid, authToken);
						var mediaUrl
						mediaUrl = 'http://smtex.me/f/'+jpg_name,
						num = params.number
						console.log(num)
						client.messages.create({
							body: 'Thank you for using smtex! Here is the url you can share :)\n' + 'smtex.me/f/' + jpg_name,
							mediaUrl: mediaUrl,
							to: num,  // Text this number
							from: '+19704001784' // From a valid Twilio number
						})
						.then((message) => console.log(message.sid));
						console.log(mediaUrl)
					});


                }
                else if (params.mml) {
                    response.writeHead(200, {'Content-Type': 'application/mathml+xml'});
                    response.end(result.mml);
                }
                else if (params.png) {
                    response.writeHead(200, {'Content-Type': 'image/png'});
                    // The reason for slice(22) to start encoding (from str to binary)
                    // after base64 header info--data:image/png;base64,
                    response.end(new Buffer(result.png.slice(22), 'base64'));
                }
            } else {
		var accountSid = 'ACCOUNTSID'; // Your Account SID from www.twilio.com/console
		var authToken = 'AUTHTOKEN';   // Your Auth Token from www.twilio.com/console

		var client = new twilio(accountSid, authToken);
		var mediaUrl
		//mediaUrl = 'http://smtex.me/f/'+jpg_name,
		num = params.number
		console.log(num)
		client.messages.create({
			body: 'Unfortunately, there was an error processing your LaTeX, here is what we know:\n' + result.errors,
			to: num,  // Text this number
			from: '+19704001784' // From a valid Twilio number
		})
		.then((message) => console.log(message.sid));
                response.writeHead(400, {'Content-Type': 'text/plain'});
                response.write('Error 400: Request Failed. \n');
                response.write(String(result.errors) + '\n');
                response.write(str_params + '\n');
                response.end();
            }
        });
    });
}

var createServer = function(port) {
    var domain = require('domain');
    var mjAPI = startMathJax();
    var server = http.createServer(function (request, response) {
        var d = domain.create();
        d.on('error', function(er) {
            console.error('error', er.stack);
            try {
                var killtimer = setTimeout(function(){
                    process.exit(1);
                }, 30000);
                killtimer.unref();
                server.close();
                cluster.worker.disconnect();
                response.statusCode = 500;
                response.setHeader('content-type', 'text/plain');
                response.end('problem!\n');
            } catch (er2) {
                console.error('Error, sending 500.', er2.stack);
            }
        });
        d.add(request);
        d.add(response);
        d.run(function(){
            handleRequest(mjAPI, request, response);
        });
    });
    server.listen(port, function(){
        console.log('Server listening on port %s' , port);
    });
    return server;
};

exports.start = function(port){
    if (cluster.isMaster) {
      // Fork workers.
      for (var i = 0; i < numCPUs; i++) {
        cluster.fork();
      }

      cluster.on('disconnect', function(worker) {
        console.error('disconnect!');
        cluster.fork();
      });

      cluster.on('exit', function(worker, code, signal) {
        console.log('worker ' + worker.process.pid + ' died');
      });
    } else {
        createServer(port);

    }
};

