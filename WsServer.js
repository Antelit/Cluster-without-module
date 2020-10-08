const WebSocketServer = new require('ws');
const port = 7000
let clients = {};

let webSocketServer = new WebSocketServer.Server({
    port: port
}, function (){
    console.log(`WebSocket server Run! On port: ${port}`)
});
webSocketServer.on('connection', function(ws) {

    var id = Math.random();
    clients[id] = ws;
    console.log("новое соединение " + id);
    for (var key in clients) {
        console.log(key)
    }
    ws.on('message', function(message) {
        console.log('получено сообщение ' + message);

        for (var key in clients) {
            clients[key].send(message);
        }
    });

    ws.on('close', function() {
        console.log('соединение закрыто ' + id);
        delete clients[id];
    });

});
setInterval(function(){
    //console.log(webSocketServer.clients)
    //console.log("setInterval", webSocketServer.clients.length)
    for (var key in webSocketServer.clients) {
        console.log(key)
        //console.log(serverSocket.clients[key])

    }}, 5000)

module.exports=webSocketServer