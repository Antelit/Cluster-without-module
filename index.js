const fs = require('fs');
const redis = require("redis");
const client = redis.createClient();
const child_process = require('child_process');
const WebSocketServer = new require('ws');
var spawn = require('child_process').spawn;    
const port = 7000


const PIDs = "PID"
const MAIN_NODE = "MAIN_NODE"
const PREF_SL_NODE = 'Node_'

let clients = {};
client.flushall();
client.subscribe('pubsub'); 

client.on("message", function(error,data) {
    for (var key in clients) {
        clients[key].send(data);
    }
    //console.log("!!!!MSG " + data);
});

client.on("error", function(error) {
    console.error("ERROR!!!!"  + error);
});

for(var i = 0; i < 6; i++) {
    var worker_process = child_process.fork("worker.js", [i]); 
    console.log(worker_process.pid)
    worker_process.on('message', function (msg) {
        console.log("!!!!!!!" + msg.PID);
    });
    
    worker_process.on('close', function (code,q,w) {
        CloseProcess(this)
    });
}

function CloseProcess(proc){
    console.log("Process " + proc.pid + " is DEAD!")
    json = { "type": "Slave", "status": "NodeCrash", "Node": PREF_SL_NODE + proc.pid }
    
    for (var key in clients) {
        clients[key].send(JSON.stringify(json));
    }

    client.unsubscribe('pubsub', function (err, done ) {
        client.LREM(PIDs, 1, proc.pid);
        client.get(MAIN_NODE, function(err, reply) {
            if(reply == proc.pid){
                client.lrange(PIDs, 0, -1, function(err, socketIds) {
                    changeMainWork(socketIds[0])
                });
            }
            client.subscribe('pubsub')
        })
    })
    
    
    var worker_process = child_process.fork("worker.js", [i]); 
    worker_process.on('close', function (code,q,w) {
        CloseProcess(this)
    });

    
}

function changeMainWork(PID){
    client.unsubscribe('pubsub', function (err, done ) {
        client.set(MAIN_NODE, PID, function(err, data){
            console.log(err, data)
        });
        client.subscribe('pubsub')
    })
}

let webSocketServer = new WebSocketServer.Server({port: port}, 
    function (){
        console.log(`WebSocket server Run! On port: ${port}`)
    }
);

webSocketServer.on('connection', function(ws) {
    var id = Math.random();
    clients[id] = ws;

    ws.send("Hello");
    client.unsubscribe('pubsub', function (err, done ) {
        client.get(MAIN_NODE, function(err, reply){ 
            let MASTER_NODE = reply

            client.lrange(PIDs, 0, -1, function(err, socketIds) {
                socketIds.slice(MASTER_NODE,1)
                
                let RunSlave = new Array();

                for (let index = 0; index < socketIds.length; index++) {
                    if(socketIds[index] != MASTER_NODE)
                        RunSlave.push(socketIds[index])
                }
                let js = {
                    "type":"init", 
                    "Master": {"Run" : MASTER_NODE, "Dead":[]},
                    "Slave": {"Run": RunSlave, "Dead":[]},
                }
                //console.log(JSON.stringify(js))
                ws.send(JSON.stringify(js));
                client.subscribe('pubsub')
            });

            
        })
    });
    
    ws.on('message', function(message){ onMessage(message) });

    ws.on('close', function() { onClose(id) });

});

function onMessage(Message){
    spawn("taskkill", ["/pid", Message, '/f', '/t']);
}

function onClose(ID_Client){
    console.log('Connection Close ' + ID_Client);
    delete clients[ID_Client];
}