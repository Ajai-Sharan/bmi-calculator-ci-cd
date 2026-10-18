const crypto = require('crypto');
const client = require('prom-client');

// ------------------------------------------------------------
// Metrics (Prometheus format, served on GET /metrics)
// ------------------------------------------------------------
const register = new client.Registry();
client.collectDefaultMetrics({ register }); // CPU, memory, event loop lag, GC

const httpRequests = new client.Counter({
    name: 'http_requests_total',
    help: 'Total HTTP requests by method, route and status code',
    labelNames: ['method', 'route', 'status'],
    registers: [register],
});

const httpDuration = new client.Histogram({
    name: 'http_request_duration_seconds',
    help: 'HTTP request duration in seconds',
    labelNames: ['method', 'route', 'status'],
    buckets: [0.005, 0.01, 0.05, 0.1, 0.5, 1],
    registers: [register],
});

// ------------------------------------------------------------
// Structured logs: one JSON object per line on stdout
// ------------------------------------------------------------
function log(level, message, fields = {}) {
    const entry = {
        time: new Date().toISOString(),
        level,
        message,
        version: process.env.APP_VERSION || 'dev',
        ...fields,
    };
    const write = level === 'error' ? console.error : console.log;
    write(JSON.stringify(entry));
}

// ------------------------------------------------------------
// Tracing with the W3C "traceparent" header:
//   00-<32 hex trace id>-<16 hex parent span id>-<2 hex flags>
// Each request is one span. If the caller sent a traceparent we continue
// its trace; otherwise a new trace id is created.
// ------------------------------------------------------------
const TRACEPARENT = /^00-([0-9a-f]{32})-([0-9a-f]{16})-[0-9a-f]{2}$/;

function requestObserver(req, res, next) {
    const incoming = TRACEPARENT.exec(req.get('traceparent') || '');
    const traceId = incoming ? incoming[1] : crypto.randomBytes(16).toString('hex');
    const parentSpanId = incoming ? incoming[2] : undefined;
    const spanId = crypto.randomBytes(8).toString('hex');
    const start = process.hrtime.bigint();

    req.traceId = traceId;
    res.setHeader('traceparent', `00-${traceId}-${spanId}-01`);
    res.setHeader('x-trace-id', traceId);

    res.on('finish', () => {
        const seconds = Number(process.hrtime.bigint() - start) / 1e9;
        const route = req.route ? req.route.path : 'unmatched';
        const labels = { method: req.method, route, status: res.statusCode };
        httpRequests.inc(labels);
        httpDuration.observe(labels, seconds);

        // Skip Kubernetes probes and Prometheus scrapes to keep logs readable.
        if (req.path === '/health' || req.path === '/metrics') {
            return;
        }
        log(res.statusCode >= 500 ? 'error' : 'info', 'request completed', {
            trace_id: traceId,
            span_id: spanId,
            parent_span_id: parentSpanId,
            method: req.method,
            path: req.path,
            status: res.statusCode,
            duration_ms: Math.round(seconds * 1e6) / 1e3,
        });
    });

    next();
}

module.exports = { register, log, requestObserver };
