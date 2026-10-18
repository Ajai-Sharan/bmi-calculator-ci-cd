const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'];

function readPort(env, name, fallback) {
    const raw = env[name];
    if (raw === undefined || raw === '') {
        return fallback;
    }
    const port = Number(raw);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
        throw new Error(`${name} must be an integer between 1 and 65535 (got "${raw}")`);
    }
    return port;
}

/**
 * Read runtime configuration from environment variables. Fails fast on bad
 * values so a misconfigured pod crashes at start instead of serving errors.
 */
function loadConfig(env = process.env) {
    const config = {
        port: readPort(env, 'PORT', 3000),
        metricsPort: readPort(env, 'METRICS_PORT', 9464),
        logLevel: env.LOG_LEVEL || 'info',
        serviceName: env.SERVICE_NAME || 'bmi-calculator-api',
        version: env.APP_VERSION || 'dev',
    };

    if (config.port === config.metricsPort) {
        throw new Error('PORT and METRICS_PORT must be different');
    }
    if (!LOG_LEVELS.includes(config.logLevel)) {
        throw new Error(`LOG_LEVEL must be one of ${LOG_LEVELS.join(', ')} (got "${config.logLevel}")`);
    }

    return config;
}

module.exports = { loadConfig };
