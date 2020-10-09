const fs = require('fs');
const redis = require("redis");
const client = redis.createClient();

let SETTING =  JSON.parse(fs.readFileSync('Setting.json'));

const publisher = redis.createClient();

const PIDs = SETTING.Redis.keyWorkProcess;
const MAIN_NODE = SETTING.Redis.keyMainNode;
const RNDINTs = SETTING.Redis.keyQueue;
const SUBSCRIBE_KEY =SETTING.Redis.keySubscribe;

const PREF_SL_NODE = SETTING.Node.Prefix_Node;
const NODEDEBUG = SETTING.Node.Debug;
const MasterIntervalMS = SETTING.Node.MasterInterval;
const SlaveIntervalMS = SETTING.Node.SlaveInterval;
const MoreCrashe = SETTING.Node.MoreCrasheSlave;

let idInterval
//Check main_node on start worker
client.get(MAIN_NODE, function(err, reply) {
    let json
    if(!reply){
        // Main Node is null
        // set main node
        client.set(MAIN_NODE, process.pid)
        //Set Action Main
        idInterval = setInterval(IntervalMaster, MasterIntervalMS);
        json = {"type": "Master", "status": "Create", "Node" : PREF_SL_NODE + process.pid}
    }else{
        // Have Main_Node
        // I`m Slave
        //Set Action Slave
        idInterval = setInterval(IntervalSlave, SlaveIntervalMS)
        json = { "type": "Slave", "status": "Create", "Node" : PREF_SL_NODE + process.pid}
    }
    publisher.publish(SUBSCRIBE_KEY, JSON.stringify(json))
});
//Add Work Process
client.lpush(PIDs, process.pid);

function IntervalMaster(){
    client.get(MAIN_NODE, function(err, reply) {
        if(reply == process.pid){ // Check: Change Master?
            client.lpush(RNDINTs, Math.random()); // Add on queue random float
            client.lrange(RNDINTs, 0, -1, function(err, cnt_int) {
                t = { "type": "Master", "status": "QueueWait", "Count" : cnt_int.length}
                publisher.publish(SUBSCRIBE_KEY, JSON.stringify(t))
            })
        }
        else{ //I'm not the boss anymore
            clearInterval(idInterval) // stop master interval
            t = { "type": "Master", "status": "BecameSlave", "Node" : PREF_SL_NODE + process.pid}
            publisher.publish(SUBSCRIBE_KEY, JSON.stringify(t))
            // Set interval on Slave
            idInterval =  setInterval(IntervalSlave, SlaveIntervalMS)
        }
    });
}

function IntervalSlave(){
    client.get(MAIN_NODE, function(err, reply) {
        // Chack: maybe I'm master?
        if(reply == process.pid){ // YES!
            clearInterval(idInterval) // stop slave interval
            // Set interval on Master
            idInterval = setInterval(IntervalMaster, MasterIntervalMS);
            t = { "type": "Master", "status": "Change","Node" : PREF_SL_NODE + process.pid}
            publisher.publish(SUBSCRIBE_KEY, JSON.stringify( t) )
        }
        else{ // NO:(
            //Get queue
            client.lrange(RNDINTs, 0, -1, function(err, cnt_int) {
                if(cnt_int.length){ // Check queue
                    let lastvar = cnt_int[randomInt(0, (cnt_int.length * ((MoreCrashe) ? 1.1 : 1))-1)] // get random value from queue
                    if(lastvar){
                        client.LREM(RNDINTs, 1, lastvar); //Delete value from queue
                        
                        client.get(PREF_SL_NODE + process.pid, function(err, reply) { // get count processed
                            let cnt;
                            cnt = (!reply) ? 1 : parseInt(reply) + 1

                            client.set(PREF_SL_NODE + process.pid, cnt)  // set new processed
                            
                            let json = {
                                    "type": "Slave", "status": "ActionComplite", "Node" : PREF_SL_NODE + process.pid, 
                                    "ActionValue": lastvar,"Processed": cnt
                                }
                            //Send to WS on Action DONE!
                            publisher.publish(SUBSCRIBE_KEY, JSON.stringify(json))
                        })
                        if(NODEDEBUG)
                            console.log("PID " + process.pid + "; queue " + cnt_int.length + "; action " + lastvar)
                    }
                    else{
                        let json = {"type": "Slave","status": "NodeCrash","Node": PREF_SL_NODE + process.pid}
                        publisher.publish(SUBSCRIBE_KEY, JSON.stringify(json))
                        process.exit(1)
                    }
                }
            });
        }
    })
}
function randomInt(min, max) { // min and max included 
    return Math.floor(Math.random() * (max - min + 1) + min);
}
process.on('message', function (msg) {
    console.log('MESSAGE ' + process.pid + " " + msg);
});