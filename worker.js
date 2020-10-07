const redis = require("redis");
const client = redis.createClient();
const PIDs = "PID"
const MAIN_NODE = "MAIN_NODE"
const RNDINTs = "RNDINTs"
const PREF_SL_NODE = 'sl_Node_'
const MasterIntervalMS = 600
const SlaveIntervalMS = 1000
let idInterval

client.get(MAIN_NODE, function(err, reply) {
    if(!reply){
        client.set(MAIN_NODE, process.pid)
        idInterval = setInterval(IntervalMaster, MasterIntervalMS);
    }else{
        idInterval = setInterval(IntervalSlave, SlaveIntervalMS)
    }
});

client.lpush(PIDs, process.pid, function(err) {
    console.log('New Node ' + process.pid);
});

let lastID = 0

function IntervalMaster(){
    client.lpush(RNDINTs, Math.random());
    /*client.lrange(PIDs, 0, -1, function(err, pr) {
        (lastID >= pr.length - 1) ? lastID = 0 : lastID++
    });*/
    console.log("PID " + process.pid + " I`m Main! ")
}

function IntervalSlave(){
    client.get(MAIN_NODE, function(err, reply) {
        if(reply == process.pid){
            console.log("PID " +  process.pid + " Now i`m Main " )
            clearInterval(idInterval)
            idInterval = setInterval(IntervalMaster, MasterIntervalMS);
        }
        else{
            client.lrange(RNDINTs, 0, -1, function(err, cnt_int) {
                if(cnt_int.length){
                    let lastvar = cnt_int[0]
                    client.get(PREF_SL_NODE + process.pid, function(err, reply) {
                        if(!reply)
                            client.set(PREF_SL_NODE + process.pid, 1)
                        else
                            client.set(PREF_SL_NODE + process.pid, parseInt(reply) + 1)        
                    })
                    client.LREM(RNDINTs, 1, lastvar);
                    console.log("PID " + process.pid + "; queue " + cnt_int.length + "; action " + cnt_int[0])
                }
            });
            
        }
    })
}

process.on('message', function (msg) {
    console.log('MESSAGE ' + process.pid + " " + msg);
});
