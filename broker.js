
import Aedes from 'aedes';
import { loadCertificates, exit } from './lib/helper.js';
import * as tls from "node:tls";
import fetch from 'node-fetch';

const aedes = new Aedes({
    protocolVersion: 4,
});

// Configuration
const config = {
    // Basic MQTT settings
    port: 1883,
    wsPort: 8888,
    host: '0.0.0.0',
    authenticate: false,  // Set to true to enable authentication

    // SSL/TLS configuration
    ssl: {
        enable: false,      // Set to true to enable SSL/TLS
        port: 443,         // Standard MQTT over TLS port
        key: './certs/broker.key',
        cert: './certs/broker.crt',
        ca: [],             // Optional array of CA certificate paths
        requestCert: false, // Whether to request client certificates
        rejectUnauthorized: true, // Reject unauthorized certificates
    },
    // Broadcast settings
    enableLogging: true,
    broadcastExcludeSystem: true,  // Don't broadcast system messages (starting with $)
    broadcastExcludePublisher: true, // Don't send messages back to original publisher
    topicFilters: [],    // Empty array means broadcast all topics, add strings to filter
    retainBroadcasts: false, // Whether to set retain flag on broadcasts
};
const clients = [];
const certs = loadCertificates(config.ssl);
const server = tls.createServer({
    ...certs,
    requestCert: config.ssl.requestCert,
    rejectUnauthorized: config.ssl.rejectUnauthorized
}, aedes.handle);

server.listen(config.ssl.port, config.host, function() {
    console.log(`MQTT over SSL/TLS server listening on port ${config.ssl.port}`);
});

const handleExit = () => {
    exit(server, aedes);
}

process.on('SIGINT', handleExit);
process.on('SIGTERM', handleExit);

aedes.authenticate = async (client, username, password, callback) => {
    const deviceId = username.split('&');

    if (deviceId.length !== 2) {
        return callback(null, true);
    }

    const regex = /(\d{8}L\d+)$/;
    const match = deviceId[0].match(regex);

    if (!match) {
        console.log('Cant extract serial number from', username);
        return callback(null, true)
    }

    const serialNumber = match[1];

    try {
        const result = await fetch(`${process.env.LOCALKIT}/6/api/topics/${serialNumber}`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        const data = await result.json();

        clients[client.id] = data.data.topics;

    } catch (error) {
        console.log('Error fetching topics', error);
    }
    callback(null, true);
};

aedes.on('client', function(client) {
    sendConnected(client.id, true);
    console.log(`Client connected: ${client.id}`);
})
aedes.on('publish', (packet, client) => {
    const keys = Object.keys(clients);

    const topicInClient = keys.filter((key) => {
        const topics = clients[key];
        return topics.includes(packet.topic) && aedes.clients[key]?.id !== client.id;
    });

    topicInClient.forEach((value, index) => {
        const targetClient = aedes.clients[value];
        console.log('got', value, packet);
        targetClient.publish({
            topic: packet.topic,
            payload: packet.payload,
            qos: packet.qos,
            retain: packet.retain,
            dup: packet.dup,
        }, () => {});
    });

});

aedes.on('clientDisconnect', (client) => {
    sendConnected(client.id, false);
    delete clients[client.id];
});

aedes.on('connectionError', function(client, err) {
    console.log('Connection Error: ', err.message);
});


async function sendConnected(clientId, state) {

    try {
        let cId = clientId.split('|');
        if (cId.length < 2) {
            return;
        }

        cId = cId[0];
        const serialNumber = cId.match(/(\d{8}L\d+)$/)[1];
        const result = await fetch(`${process.env.LOCALKIT}/6/api/connected/${serialNumber}`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: {
                'connected': state
            }
        });
    } catch(error) {
        console.log('Error sending connected', error);
    }

}

