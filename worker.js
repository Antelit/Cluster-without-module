const redis = require("redis");
const client = redis.createClient();
const PIDs = "PID"
const MAIN_NODE = "MAIN_NODE"
const RNDINTs = "RNDINTs"
const PREF_SL_NODE = 'Node_'
const MasterIntervalMS = 100
const SlaveIntervalMS = 500
let idInterval

client.get(MAIN_NODE, function(err, reply) {
    let json
    if(!reply){
        client.set(MAIN_NODE, process.pid)
        idInterval = setInterval(IntervalMaster, MasterIntervalMS);
        json = {
            "type": "Master",
            "status": "Create",
            "Node" : PREF_SL_NODE + process.pid
            }
    }else{
        idInterval = setInterval(IntervalSlave, SlaveIntervalMS)
        json = {
            "type": "Slave",
            "status": "Create",
            "Node" : PREF_SL_NODE + process.pid
            }
    }
    client.publish("pubsub", JSON.stringify(json))
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
    //console.log("PID " + process.pid + " I`m Main! ")
}

function IntervalSlave(){
    client.get(MAIN_NODE, function(err, reply) {
        if(reply == process.pid){
            console.log("PID " +  process.pid + " Now i`m Main " )
            clearInterval(idInterval)
            idInterval = setInterval(IntervalMaster, MasterIntervalMS);
            t = {
                "type": "Master",
                "status": "Change",
                "Node" : PREF_SL_NODE + process.pid
                }
            client.publish("pubsub", JSON.stringify( t) )
        }
        else{
            client.lrange(RNDINTs, 0, -1, function(err, cnt_int) {
                if(cnt_int.length){
                    
                    let id = randomIntFromInterval(0, cnt_int.length -1)
                    let lastvar = cnt_int[id]
                    if(lastvar){
                        client.LREM(RNDINTs, 1, lastvar);
                        
                        client.get(PREF_SL_NODE + process.pid, function(err, reply) {
                            let cnt;
                            if(!reply)
                                cnt = 1
                            else
                                cnt = parseInt(reply) + 1
                                //client.set(PREF_SL_NODE + process.pid, parseInt(reply) + 1)  
                            client.set(PREF_SL_NODE + process.pid, cnt)  
                            
                            let json = {
                                "type": "Slave",
                                "status": "ActionComplite",
                                "Node" : PREF_SL_NODE + process.pid,
                                "ActionValue": lastvar,
                                "Processed": cnt
                                }
                            //Send to WS on Action DONE!
                            client.publish("pubsub", JSON.stringify(json))
                        })
                        console.log("PID " + process.pid + "; queue " + cnt_int.length + "; action " + lastvar)
                    }
                    else{
                        let json = {
                            "type": "Slave",
                            "status": "NodeCrash",
                            "Node": PREF_SL_NODE + process.pid
                            }
                        client.publish("pubsub", JSON.stringify(json))
                        //console.log("PID " + process.pid + " !!!CRASH!!!")
                        process.exit(1)
                    }
                }
            });
        }
    })
}
function randomIntFromInterval(min, max) { // min and max included 
    return Math.floor(Math.random() * (max - min + 1) + min);
}
process.on('message', function (msg) {
    console.log('MESSAGE ' + process.pid + " " + msg);
});
