import fs from "fs";

export function loadCertificates(sslConfig) {
    try {
        const certs = {
            key: fs.readFileSync(sslConfig.key),
            cert: fs.readFileSync(sslConfig.cert)
        };

        // Load CA certificates if provided
        if (sslConfig.ca && sslConfig.ca.length > 0) {
            certs.ca = sslConfig.ca.map(caPath => fs.readFileSync(caPath));
        }

        return certs;
    } catch (error) {
        console.error('Error loading certificates:', error.message);
        console.error('SSL server will not start. Please check your certificate paths.');
        return null;
    }
}

export function exit(server, aedes) {
    console.log('Shutting down MQTT broker...');
    aedes.close(() => {
        console.log('MQTT broker closed');
        process.exit(0);
    });
};

