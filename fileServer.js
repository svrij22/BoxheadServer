var fs = require('fs');
var http = require('http');

http.createServer(function (req, res, next) {
	try{

		//Logging
		console.log (req.method)

		//Set headers
		var headers = {
			"Access-Control-Allow-Origin": "*",
			"Access-Control-Allow-Headers": "Origin, X-Requested-With, Content-Type, Accept, authkey"
		}

		//Cors
		if (req.method === 'OPTIONS'){
			res.writeHead(200, headers);
			res.end();
			return;
		}

		//Auth key gen
		username = "123";
		password = "123";
		let auth = "auth" + new Buffer(username + ":" + password).toString("base64");

		//Check authentication
		let authComplete = false;
		let authGet = req.headers.authkey;

		if (authGet !== undefined){
			if (authGet.includes(auth)){
				authComplete = true;
				//
				console.log("Authenticated!")
			}
		}

		console.log(authGet)

		if (authComplete){
			fs.readFile(__dirname + "/public"+ req.url, function (err,data) {
				if (err) {
					console.log("404")
					res.writeHead(404, headers);
					res.end(JSON.stringify(err));
					return;
				}
				console.log("200")
				res.writeHead(200, headers);
				res.write('test');
				res.end(data);
			});
		}else{
			console.log("401")
			res.writeHead(401);
			res.end(auth);
		}
	}catch (e) {
		console.log(e.message);
	}

}).listen(8090);