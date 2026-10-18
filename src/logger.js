const pino = require('pino');
const { trace } = require('@opentelemetry/api');

/**
 * JSON logger on stdout. Every line carries service/version, and lines written
 * while a span is active also carry trace_id/span_id for log-trace correlation.
 */
function createLogger(config, destination) {
    return pino(
        {
            level: config.logLevel,
            base: { service: config.serviceName, version: config.version },
            timestamp: pino.stdTimeFunctions.isoTime,
            formatters: {
                level: (label) => ({ level: label }),
            },
            redact: ['req.headers.authorization', 'req.headers.cookie'],
            mixin() {
                const span = trace.getActiveSpan();
                if (!span) {
                    return {};
                }
                const { traceId, spanId } = span.spanContext();
                return { trace_id: traceId, span_id: spanId };
            },
        },
        destination,
    );
}

module.exports = { createLogger };
