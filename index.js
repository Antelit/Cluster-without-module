const fs = require('fs');
const redis = require("redis");
const client = redis.createClient();
const child_process = require('child_process');

//taskkill /F /PID 22216

const PIDs = "PID"
const MAIN_NODE = "MAIN_NODE"

client.on("error", function(error) {
    console.error(error);
});

for(var i = 0; i < 3; i++) {
    var worker_process = child_process.fork("worker.js", [i]); 
    console.log(worker_process.pid)

    worker_process.on('message', function (msg) {
        //console.log(msg.PID);
    });
    
    worker_process.on('close', function (code,q,w) {
        CloseProcess(this)
    });
}

function CloseProcess(proc){
    console.log("Process " + proc.pid + " is DEAD!")
    client.LREM(PIDs, 1, proc.pid);
    client.get(MAIN_NODE, function(err, reply) {
        if(reply == proc.pid){
            client.lrange(PIDs, 0, -1, function(err, socketIds) {
                changeMainWork(socketIds[0])
            });
        }
    })
    
    var worker_process = child_process.fork("worker.js", [i]); 
    worker_process.on('close', function (code,q,w) {
        CloseProcess(this)
    });
}

function changeMainWork(PID){
    client.set(MAIN_NODE, PID);
}