const app = require('./app');
const { log } = require('./observability');

// Port is configurable through the PORT environment variable (default 3000).
const PORT = Number(process.env.PORT) || 3000;

const server = app.listen(PORT, () => {
    log('info', 'server started', { port: PORT });
});

// Kubernetes sends SIGTERM before stopping a pod: finish in-flight requests, then exit.
process.on('SIGTERM', () => {
    log('info', 'SIGTERM received, shutting down');
    server.close(() => process.exit(0));
});
