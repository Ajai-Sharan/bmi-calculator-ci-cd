const client = require('prom-client');

/**
 * Prometheus metrics for the service. A dedicated registry keeps tests isolated
 * and makes it explicit which series are exported on /metrics.
 */
function createMetrics(config) {
    const registry = new client.Registry();
    registry.setDefaultLabels({ service: config.serviceName });
    client.collectDefaultMetrics({ register: registry });

    const httpRequests = new client.Counter({
        name: 'http_requests_total',
        help: 'HTTP requests handled, by method, route and status code',
        labelNames: ['method', 'route', 'status_code'],
        registers: [registry],
    });

    const httpDuration = new client.Histogram({
        name: 'http_request_duration_seconds',
        help: 'HTTP request latency in seconds, by method, route and status code',
        labelNames: ['method', 'route', 'status_code'],
        buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5],
        registers: [registry],
    });

    const bmiCalculations = new client.Counter({
        name: 'bmi_calculations_total',
        help: 'Successful BMI calculations, by resulting category',
        labelNames: ['category'],
        registers: [registry],
    });

    const validationFailures = new client.Counter({
        name: 'bmi_validation_failures_total',
        help: 'Rejected BMI requests, by invalid field',
        labelNames: ['field'],
        registers: [registry],
    });

    const appInfo = new client.Gauge({
        name: 'app_info',
        help: 'Build information for the running service (value is always 1)',
        labelNames: ['version'],
        registers: [registry],
    });
    appInfo.set({ version: config.version }, 1);

    return { registry, httpRequests, httpDuration, bmiCalculations, validationFailures };
}

module.exports = { createMetrics };
