var util = require('util');
var fs = require('fs');
var http = require('http');
var osu = require('node-os-utils')

var cpu = osu.cpu
var mem = osu.mem
var netstat = osu.netstat

var clients = [];

//create all sockets
//server size is 50 players

var socketamt = 10;
var sockets = new Array(socketamt);

//Version
var gameVersion = 107

for (i = 0; i < socketamt; i++) {
	socket_reset(i)
}

var users = new Array(socketamt);

//Set the group size
var groupSize = 10;
var groupsMax = 4;
var groupState = [];

var dataMap = new Array(groupSize);
for (i = 0; i < groupSize; i++) {
	dataMap[i] = {}
	groupState[i] = -1
}

//port and host
var PORT = 3001;
var HOST = '0.0.0.0';
var dgram = require('dgram');
var server = dgram.createSocket('udp4');

server.on('listening', function () {
	const address = server.address();
	console.log('UDP Server v2 listening on ' + address.address + ":" + address.port);
});

//interval function for heartbeats
var heartbeatTicker = setInterval(function () {

	//Heartbeat
	heartbeat_tick();
	DATA_tick_amount += 1;
	DATA_playtime += 2 * get_connected_socket_amt()
	console.log(groupState)

	//Group state
	for (i = 0; i < groupSize; i++) {

		//cleanup
		if (groupState[i] === 2) {
			groupState[i] = -1
			dataMap[i] = {}
		}

		//no players? remove map
		if (Object.keys(dataMap[i]).length > 0 && get_connected_socket_group(i) === 0) {
			console.log("Removed data")
			dataMap[i] = {}
			groupState[i] = -1
		}

		//Set groupState to 1 if wave > 4// so no new players connect
		try {
			if (dataMap[i].config.wave > 4) {
				if (groupState[i] <= 0) {
					groupState[i] = 1
				}
			}
		} catch (err) {
		}
	}
}, 2000);

//Logging


//playerData
try {
	playerData = fs.readFileSync('./public/playerData.json', 'utf-8')
	playerData = JSON.parse(playerData);
} catch (err) {
	console.log(err.message)
	playerData = [];
}

//Load data from page ticker and dataMap
try {
	dataItems = fs.readFileSync('./public/dataFile.json', 'utf-8')
	dataItems = JSON.parse(dataItems)
	DATA_tick_amount = dataItems["ticks"]
	DATA_errors = dataItems["errors"]
	DATA_login_tries = dataItems["logintries"]
	DATA_packets = dataItems["packets"]
	DATA_packet_type = dataItems["packet_types"]
	DATA_playtime = dataItems["playtime"]
	DATA_ips = dataItems["uniqueips"]
	if (Object.keys(dataItems).length < 3) throw "reading error"

	if (dataItems["version"] !== gameVersion) {
		throw "version error"
	}

} catch (err) {
	console.log(err.message)
	var dataItems = {}
	var DATA_tick_amount = 0
	var DATA_errors = 0
	var DATA_login_tries = 0
	var DATA_packets = 0
	var DATA_packet_type = {}
	var DATA_playtime = 0
	var DATA_ips = []
}

//Setup page ticker
function writeDataFile() {
	dataItems["version"] = gameVersion
	dataItems["ticks"] = DATA_tick_amount
	dataItems["sockets"] = sockets
	dataItems["errors"] = DATA_errors
	dataItems["logintries"] = DATA_login_tries
	dataItems["packets"] = DATA_packets
	dataItems["players_online"] = get_connected_socket_amt()
	dataItems["players_max"] = socketamt
	dataItems["packet_types"] = DATA_packet_type
	dataItems["uniqueips"] = DATA_ips
	dataItems["playtime"] = DATA_playtime // in seconds
	dataItems["playtimesec"] = DATA_playtime % 60
	dataItems["playtimemin"] = Math.floor(DATA_playtime / 60) % 60
	dataItems["playtimehr"] = Math.floor(DATA_playtime / 3600)
	dataItems["gameMaps"] = dataMap


	mem.info()
		.then(info => {
			dataItems["memusage"] = info;
		})

	cpu.usage()
		.then(cpuPercentage => {
			dataItems["cpuusage"] = cpuPercentage;
		})
	netstat.inOut()
		.then(info => {
			dataItems["netusage"] = info;
		})

	fs.writeFileSync('./public/dataFile.json', JSON.stringify(dataItems, null, 2), 'utf-8')
	fs.writeFileSync('./dataMap.json', JSON.stringify(dataMap, null, 2), 'utf-8');
} //20 000 later

function writePlayerFile() {
	fs.writeFileSync('./public/playerData.json', JSON.stringify(playerData, null, 2), 'utf-8')
}

//do every minute
const fileSaveTicker = setInterval(function () {
	writeDataFile();
	writePlayerFile();
}, 20000);

//Setup server
http.createServer(function (req, res, next) {
	try {

		//Logging
		console.log(req.method)

		//Set headers
		var headers = {
			"Access-Control-Allow-Origin": "*",
			"Access-Control-Allow-Headers": "Origin, X-Requested-With, Content-Type, Accept, authkey"
		}

		//Cors
		if (req.method === 'OPTIONS') {
			res.writeHead(200, headers);
			res.end();
			return;
		}

		//Update files
		if ((req.url).includes("dataFile")) writeDataFile();
		if ((req.url).includes("playerData")) writePlayerFile();

		//Auth key gen
		username = "123";
		password = "123";
		let auth = "auth" + new Buffer(username + ":" + password).toString("base64");

		//Check authentication
		let authComplete = false;
		let authGet = req.headers.authkey;

		if (authGet !== undefined) {
			if (authGet.includes(auth)) {
				authComplete = true;
				console.log("Authenticated!")
			}
		}

		console.log(authGet)

		if (authComplete) {
			fs.readFile(__dirname + "/public" + req.url, function (err, data) {
				if (err) {
					res.writeHead(404, headers);
					res.end(JSON.stringify(err));
					return;
				}
				res.writeHead(200, headers);
				res.end(data);
			});
		} else {
			res.writeHead(401);
			res.end(auth);
		}
	} catch (e) {
		console.log(e.message);
	}

}).listen(8090);

//retrieve or get new identity
function socket_get_ID(remote) {

	//id exists?
	for (var i in sockets) {
		if (remote_equals(sockets[i].remote, remote)) {
			return i;
		}
	}

	//new id if spot is open
	for (var i in sockets) {
		if (sockets[i].heartbeat === -1) {
			socket_reset(i);
			sockets[i].remote = remote;
			sockets[i].heartbeat = 5;
			return i;
		}
	}

	return -1
}

function remote_equals(remote1, remote2) {
	return (remote1.address === remote2.address && remote1.port === remote2.port)
}

//get group by remote
function socket_get_group(remote) {
	for (var i in sockets) {
		if (remote_equals(sockets[i].remote, remote)) {
			console.log("group found")
			return sockets[i].group
		}
	}
	console.log("cant find group")
	return -1;
}

//get amount of connected sockets to server
function get_connected_socket_amt() {
	amt = 0
	for (var i in sockets) {
		if (sockets[i].heartbeat > 0) {
			amt += 1
		}
	}
	return amt
}

//get amount of connected sockets to group
function get_connected_socket_group(thisGroup) {
	amt = 0
	for (var i in sockets) {
		if (sockets[i].heartbeat > 0 && sockets[i].group == thisGroup) {
			amt += 1
		}
	}
	return amt
}

//get new group
function socket_get_new_group(remote) {
	for (groupID = 0; groupID < groupSize; groupID++) {
		if (retrieve_remotes(groupID).length < groupsMax) {
			if (groupState[groupID] < 1) {
				id = socket_get_ID(remote)
				sockets[id].group = groupID
				return
			}
		}
	}
}

//retrieves all remotes for group
function retrieve_remotes(group) {
	var remotes = []

	for (i = 0; i < sockets.length; i++) {
		if (sockets[i].group == group) {
			remotes.push(sockets[i].remote)
		}
	}

	return remotes
}

//retrieves all ids for group
function retrieve_ids(group) {
	var ids = []

	for (i = 0; i < sockets.length; i++) {
		if (sockets[i].group == group) {
			ids.push(i)
		}
	}

	return ids
}

//ticks heartbeats off every 2s
function heartbeat_tick() {
	for (var i in sockets) {
		if (sockets[i].heartbeat > -1) {
			sockets[i].ticks += 1;
			sockets[i].heartbeat -= 1;
			if (sockets[i].heartbeat < 0) {
				socket_reset(i);
			}
			if (sockets[i].gameoverTicker > 0) {
				sockets[i].gameoverTicker -= 1
			}
		}
	}
}

//Resets socket
function socket_reset(id) {
	sockets[id] = {
		'remote': {},
		'heartbeat': -1,
		'group': -1,
		'name': '',
		'ticks': 0,
		'gameoverTicker': 0
	};
}

//get socket that is associated with the connected remote
function get_id_of_remote(remote) {
	for (var id in sockets) {
		if (remote_equals(sockets[id].remote, remote)) {
			return id;
		}
	}
	return -1
}

//update heartbeat with associated remote
function heartbeat_update(remote) {
	for (var i in sockets) {
		if (remote_equals(sockets[i].remote, remote)) {
			sockets[i].heartbeat = 5
			return true
		}
	}
	return false
}

//Add ip to unique ips
function DATA_add_ip(address) {
	if (!DATA_ips.includes(address)) {
		DATA_ips.push(address)
	}
}

server.on('message', function (message, remote) {


	try {
		//Get group and log message
		group = socket_get_group(remote);
		var messagetype = Number(message.readInt16LE());
		console.log(remote.address + ':' + remote.port + ' - type ' + messagetype + ' - ' + message);

		//Data micro server
		DATA_packets += 1
		if (!DATA_packet_type[messagetype]) DATA_packet_type[messagetype] = 0
		DATA_packet_type[messagetype] += 1

		if (messagetype == 0) { // Heartbeat packet
			console.log("Ping request");

			//update the heartbeat
			if (heartbeat_update(remote)) {

				//write type 0
				bufA = new Buffer(2);
				bufA.writeUInt16LE(0);

				server.send(bufA, 0, bufA.length, remote.port, remote.address);
			}
		}

		if (messagetype == 1) { //UDP Packet
			console.log("UDP packet");
			heartbeat_update(remote)

			_buffer = new Buffer(message);

			remotes = retrieve_remotes(group);

			remotes.forEach(function (remote) {
				server.send(_buffer, 0, _buffer.length, remote.port, remote.address);
			});
		}

		if (messagetype == 2) { //Login Request

			//Data micro server
			DATA_login_tries += 1
			DATA_add_ip(remote.address)

			//Create buffer
			bufA = new Buffer(2);

			//read name and version
			version = message.readInt16LE(2);
			name = message.toString('utf8', 4);
			ID = -1;

			//Test version
			if (version == gameVersion) {
				ID = socket_get_ID(remote)
			}

			//Test if id was found
			if (ID > -1) {
				console.log("Login Request from " + name + " returning key " + ID);

				//Set id name
				sockets[ID].name = name;

				//Set packet type
				buf1 = new Buffer(2);
				buf1.writeUInt16LE(2);

				//ID
				buf2 = new Buffer(2);
				buf2.writeUInt16LE(ID);

				totalLength = buf1.length + buf2.length;
				bufA = Buffer.concat([buf1, buf2], totalLength);
			} else {
				//Must either be full
				console.log("Servers are full");

				//Flagged error
				bufA.writeUInt16LE(7);
			}

			//Or the version isnt right
			if (version != gameVersion) {
				console.log("Wrong version")
				bufA.writeUInt16LE(8);
			}

			server.send(bufA, 0, bufA.length, remote.port, remote.address);
		}

		if (messagetype == 3) { // Get group
			console.log("Group get attempt")

			if (group == -1) {
				socket_get_new_group(remote);
				group = socket_get_group(remote);
			}

			//Debug message
			if (group != -1) {
				console.log("Group change in group " + String(group));
			} else {
				console.log("Groups are full")
				return
			}

			//Send accept
			bufA = new Buffer(2);
			bufA.writeUInt16LE(3);

			server.send(bufA, 0, bufA.length, remote.port, remote.address);
		}

		if (messagetype == 5) { //Data Write
			console.log("UDP packet (write)");

			if (group == -1) {
				console.log("group unset")
			}

			//Get dict and merge
			text = message.toString('ascii', 2);
			text = text.replace(/.$/g, '')
			dict = JSON.parse(text)

			//merge dictionaries
			dataMap[group][dict.type] = Object.assign({}, dataMap[group][dict.type], dict)
		}

		if (messagetype == 6) { //Get all packets
			console.log("UDP packet (get json)");

			if (group == -1) {
				console.log("group unset")
			}

			//Set type
			buf = Buffer.alloc(2);
			buf.writeUInt16LE(6);

			//Add identities
			var subvar = {}
			subvar = dataMap[group]
			subvar["identities"] = retrieve_ids(group)

			//Stringify dataMap
			mdata = JSON.stringify(subvar);
			bufmdata = Buffer.from(mdata);

			//Concat
			bufA = Buffer.concat([buf, bufmdata]);

			//Send
			server.send(bufA, 0, bufA.length, remote.port, remote.address);
		}

		if (messagetype == 7) { //Data remove
			console.log("UDP packet (remove)");

			if (group == -1) {
				console.log("group unset")
			}

			//Get dict and merge
			text = message.toString('ascii', 2);
			text = text.replace(/.$/g, '')
			dict = JSON.parse(text)

			//merge dictionaries
			Object.keys(dict).forEach(function (value, key, map) {
				console.log(value, key)
				delete dataMap[group][dict.type][value]
			})
		}

		if (messagetype == 9) {
			console.log("Connection test");

			//Send back
			_buffer = new Buffer(message);
			server.send(_buffer, 0, _buffer.length, remote.port, remote.address);
		}

		if (messagetype == 11) {
			console.log("Game end request");

			var ID = get_id_of_remote(remote);
			sockets[ID].gameoverTicker = 2;

			var identities = retrieve_ids(group)
			var gmIds = identities.filter((id => {
				return (sockets[id].gameoverTicker > 0);
			}))

			console.log(identities)
			console.log(gmIds)

			var gameOver = (identities.length === gmIds.length)

			if (gameOver) {
				//Set gameover
				dataMap[group].config.wavestate = "GAMEOVER";
				dataMap[group].config.waveticker += 100;
				groupState[group] = 1;
			}

			bufA = new Buffer.alloc(4);
			bufA.writeUInt16LE(11);
			bufA.writeUInt16LE(gameOver, 2);

			server.send(bufA, 0, bufA.length, remote.port, remote.address);
		}
		if (messagetype == 12) {

			//Get dict and merge
			text = message.toString('ascii', 2);
			text = text.replace(/.$/g, '')
			dict = JSON.parse(text)

			//find data
			dataIndex = playerData.findIndex(value => {
				return (value.clientid === dict.clientid);
			})

			//add or update data
			if (dataIndex !== -1) {
				console.log("found")
				playerData[dataIndex] = dict
			} else {
				console.log("not found")
				playerData.push(dict);
			}
		}

	} catch (err) {
		console.log("\n\n ERROR", err.message, "\n\n")
		DATA_errors += 1

		try {
			8
			fd = fs.openSync("./public/errors.log", 'a');
			fs.appendFileSync(fd, "ERROR\n" + err.stack + "\n\n");
		} catch (err) {
			fs.appendFileSync("./public/errors.log", "ERROR\n" + err.message + "\n\n" + err.stack + "\n\n");
		} finally {
			if (fd !== undefined)
				fs.closeSync(fd);
		}
	}

});

server.bind(PORT, HOST);