const fs = require('fs');
const redis = require("redis");
const spawn = require('child_process').spawn;
const child_process = require('child_process');

let SETTING =  JSON.parse(fs.readFileSync('Setting.json'));

const WebSocketServer = new require('ws');
const PORT = SETTING.WebSocket.Port
const WEBSOCKETDEBUG = SETTING.WebSocket.Debug;

const PIDs = SETTING.Redis.keyWorkProcess;
const MAIN_NODE = SETTING.Redis.keyMainNode;
const SUBSCRIBE_KEY = SETTING.Redis.keySubscribe;
const DEADMASTERS_KEY = SETTING.Redis.keyDeadMaster;
const DEADSLAVES_KEY = SETTING.Redis.keyDeadSlave;

const PREF_SL_NODE = SETTING.Node.Prefix_Node;
const COUNT_NODES =  SETTING.Node.Count;
const NODEDEBUG = SETTING.Node.Debug;

const client = redis.createClient();        // Client for work on redis
const subscriber = redis.createClient();    // Client on subscribe event

let clients = {};                       // List WebSocket Client
let OFF = false
client.flushall();                      // Clear Redis DB
subscriber.subscribe(SUBSCRIBE_KEY);    // Listen Event on key

// Send message to all WebSocketClient
subscriber.on("message", function(error,data) {
    for (var key in clients) {
        clients[key].send(data);
    }
});

client.on("error", function(error) {
    console.error("ERROR!!!! "  + error);
});
// Start Workers
for(var i = 0; i < COUNT_NODES; i++) {
    var worker_process = child_process.fork("worker.js"); 
    //Listen Event 'close' on Worker
    worker_process.on('close', function (code,q,w) {
        CloseProcess(this)
    });
}

function CloseProcess(proc){
    let a = OFF;
    OFF = false
    if(NODEDEBUG)
        console.log(`Process ${proc.pid} is DEAD!`) 

    json = { "type": "Slave", "status": "NodeCrash", "Node": PREF_SL_NODE + proc.pid }
    
    for (var key in clients) {
        clients[key].send(JSON.stringify(json));
    }

    client.LREM(PIDs, 1, proc.pid); // Delete DEAD process from list work process
    
    client.get(MAIN_NODE, function(err, reply) {
        if(reply == proc.pid){ // If dead is main process
            client.lpush(DEADMASTERS_KEY, proc.pid);
            client.lrange(PIDs, 0, -1, function(err, PIDS) {
                if(NODEDEBUG)
                    console.log(`Process ${proc.pid} was the MASTER!`) 
                let getRandom = randomInt(0, PIDS.length -1) // getRandom for find work node and set master
                changeMainWork(PIDS[getRandom])
            });
        }
        else{
            client.lpush(DEADSLAVES_KEY, proc.pid);
        }
    })
    if(!a){
        var worker_process = child_process.fork("worker.js"); // Start new node 
        //Listen Event 'close' on Worker
        worker_process.on('close', function () {
            CloseProcess(this)
        });
    }
}

function changeMainWork(PID){
    //Set new MASTER NODE
    if(NODEDEBUG)
        console.log(`Process ${PID} now Master!`) 
    client.set(MAIN_NODE, PID, function(err){
        if(err)
            console.log(err)
    });
}
//Start WebSocket Server
let webSocketServer = new WebSocketServer.Server({port: PORT}, 
    function (){
        console.log(`WebSocket server Run! On port: ${PORT}`)
    }
);

webSocketServer.on('connection', function(WebSocketClient) {
    //Save client WebSocket
    var id = Math.random();
    if(WEBSOCKETDEBUG)
        console.log(`WebSocket connect new client ${id}`) 
    clients[id] = WebSocketClient;
    // Create INIT data to new client WebSocket
    client.get(MAIN_NODE, function(err, reply){ 
        let MASTER_NODE = reply

        client.lrange(PIDs, 0, -1, function(err, PIDS) {
            let RunSlave = new Array();
            for (let index = 0; index < PIDS.length; index++) {
                if(PIDS[index] != MASTER_NODE)
                    RunSlave.push(PIDS[index])
            }
            client.lrange(DEADMASTERS_KEY, 0, -1, function(err, D_Masters) {
                client.lrange(DEADSLAVES_KEY, 0, -1, function(err, D_Slaves) {
                    let js = {"type":"init", "Master": {"Run" : MASTER_NODE, "Dead":D_Masters},"Slave": {"Run": RunSlave, "Dead":D_Slaves}}
                    WebSocketClient.send(JSON.stringify(js));
                })
            })
        });
    })
    
    WebSocketClient.on('message', function(message){ onMessage(message) });

    WebSocketClient.on('close', function() { onClose(id) });
});

function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1) + min);
}
//Listen incomint message on WebSocket
function onMessage(Message){
    if(WEBSOCKETDEBUG)
        console.log(Message)
    try{
        let msg = JSON.parse(Message)
        switch(msg.action){
            case "crashNode":
                StopProcess(msg.node)
            break;
            case "changeMaster":
                changeMainWork(msg.node)
            break;
            case "stopNode":
                OFF = true
                StopProcess(msg.node)
            break;
            case "startNewNode":
                StartProcess(msg.node)
            break;
        }
    }catch(e){
        console.log(e)
    }
}
function StopProcess(pid){
    switch(process.platform) {
        case 'win32': //On Win32-64
            spawn("taskkill", ["/pid", pid, '/f', '/t']);
        break;
        case 'darwin': // On MacOs
            spawn("kill", [pid]);
        default: // Other?
            spawn("kill", [pid]);
            console.log(process.platform)
    }
}
function StartProcess(){
    var worker_process = child_process.fork("worker.js"); // Start new node 
    //Listen Event 'close' on Worker
    worker_process.on('close', function () {
        CloseProcess(this)
    });
}

function onClose(ID_Client){
    if(WEBSOCKETDEBUG)
        console.log(`WebSocket Client ${ID_Client} disconect`) 
    delete clients[ID_Client];
}