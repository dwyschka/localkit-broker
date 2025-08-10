import EventEmitter from "events";

export default class ClientManager extends EventEmitter {
    constructor() {
        super();
        this.connectedClients = [];
    }

    addClient(client) {
        this.connectedClients.push(client);
        this.emit('clientAdded', client, this.connectedClients);
    }

    removeClient(client) {
        const index = this.connectedClients.findIndex(c => c.id === client.id);
        if (index !== -1) {
            const removed = this.connectedClients.splice(index, 1)[0];
            this.emit('clientRemoved', removed, this.connectedClients);
        }
    }

    updateClient(clientId, updates) {
        const client = this.connectedClients.find(c => c.id === clientId);
        if (client) {
            Object.assign(client, updates);
            this.emit('clientUpdated', client, this.connectedClients);
        }
    }
}
