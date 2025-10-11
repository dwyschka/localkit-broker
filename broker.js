import Aedes from 'aedes';
import {loadCertificates, exit} from './lib/helper.js';
import * as tls from "node:tls";
import fetch from 'node-fetch';
import ClientManager from './emitter.js';

const aedes = new Aedes({
    protocolVersion: 4,
});
const regEx = process.env.SERIALNUMBER_REGEX;

if(regEx === undefined) {
    console.log('No SERIALNUMBER_REGEX found in environment variables');
    process.exit(1);
}

const connectedClients = new ClientManager();
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

server.listen(config.ssl.port, config.host, function () {
    console.log(`MQTT over SSL/TLS server listening on port ${config.ssl.port}`);
});

const handleExit = () => {
    exit(server, aedes);
}

process.on('SIGINT', handleExit);
process.on('SIGTERM', handleExit);

aedes.authenticate = async (client, username, password, callback) => {

    try {
        const match = username.match(regEx);
        const serialNumber = match.groups.serialNumber;

        if(serialNumber === undefined) {
            console.log('No serial number found in username');
            callback(null, true);
            return;
        }

        console.log(`${process.env.LOCALKIT}/6/api/topics/${serialNumber}`);

        const result = await fetch(`${process.env.LOCALKIT}/6/api/topics/${serialNumber}`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        const data = await result.json();

        console.log('Received Device', client.id);
        console.log('Set Topics', data.data.topics);

        clients[client.id] = data.data.topics;

    } catch (error) {
        console.log('Error fetching topics', username, client.id);
        console.log(error);
    }
    callback(null, true);
};

aedes.on('client', async function (client) {
    await sendConnectionStatus(client, true);
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
        targetClient.publish({
            topic: packet.topic,
            payload: packet.payload,
            qos: packet.qos,
            retain: packet.retain,
            dup: packet.dup,
        }, () => {
        });
    });

});

aedes.on('clientDisconnect', async (client) => {
    await sendConnectionStatus(client, false);
    console.log(`Client Disconnected : ${client.id}`);
});

aedes.on('connectionError', function (client, err) {
    console.log('Connection Error: ', err.message);
});

connectedClients.on('clientAdded', (client, allClients) => {
    aedes.publish({
        topic: 'localkit/clients',
        payload: JSON.stringify(allClients.map(c => c.id)),
        qos: 1,
        retain: true,
        dup: false,
    }, (err) => console.log(err));
});
connectedClients.on('clientRemoved', (client, allClients) => {
    aedes.publish({
        topic: 'localkit/clients',
        payload: JSON.stringify(allClients.map(c => c.id)),
        qos: 1,
        retain: false,
        dup: true,
    }, (err) => console.log(err));
})

async function sendConnectionStatus(client, state) {
    if (state) {
        connectedClients.addClient(client)
    } else {
        connectedClients.removeClient(client)
    }
}

