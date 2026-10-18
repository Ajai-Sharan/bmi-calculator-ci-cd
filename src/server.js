const { loadConfig } = require('./config');
const { createLogger } = require('./logger');
const { initTracing } = require('./tracing');
const { createMetrics } = require('./metrics');
const { createApp, createMetricsApp } = require('./app');

const config = loadConfig();
const logger = createLogger(config);
const tracing = initTracing(config, logger);
const metrics = createMetrics(config);

let ready = false;
const app = createApp({ config, logger, metrics, tracer: tracing.tracer, isReady: () => ready });

const server = app.listen(config.port, () => {
    ready = true;
    logger.info({ port: config.port, metricsPort: config.metricsPort }, 'BMI API listening');
});
const metricsServer = createMetricsApp(metrics.registry).listen(config.metricsPort);

function shutdown(signal) {
    logger.info({ signal }, 'shutting down: draining in-flight requests');
    ready = false;

    // Hard stop if connections do not drain within Kubernetes' grace period.
    setTimeout(() => {
        logger.error('graceful shutdown timed out');
        process.exit(1);
    }, 20000).unref();

    server.close(() => {
        metricsServer.close();
        tracing.shutdown().finally(() => {
            logger.info('shutdown complete');
            process.exit(0);
        });
    });
    server.closeIdleConnections();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('uncaughtException', (err) => {
    logger.fatal({ err }, 'uncaught exception');
    process.exit(1);
});
