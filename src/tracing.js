const { NodeTracerProvider } = require('@opentelemetry/sdk-trace-node');
const { SimpleSpanProcessor } = require('@opentelemetry/sdk-trace-base');
const { resourceFromAttributes } = require('@opentelemetry/resources');

// ExportResultCode.SUCCESS from @opentelemetry/core
const EXPORT_SUCCESS = 0;

function toMillis([seconds, nanos]) {
    return Math.round((seconds * 1e3 + nanos / 1e6) * 1000) / 1000;
}

/**
 * Writes each finished span as one structured log line. This keeps traces
 * inspectable with `kubectl logs` without running a tracing backend; an OTLP
 * exporter can be added here later without touching the instrumentation.
 */
class LogSpanExporter {
    constructor(logger) {
        this.logger = logger;
    }

    export(spans, resultCallback) {
        for (const span of spans) {
            const context = span.spanContext();
            const parent = span.parentSpanContext ? span.parentSpanContext.spanId : undefined;
            this.logger.info(
                {
                    type: 'span',
                    trace_id: context.traceId,
                    span_id: context.spanId,
                    parent_span_id: parent,
                    span_name: span.name,
                    duration_ms: toMillis(span.duration),
                    status_code: span.status.code,
                    attributes: span.attributes,
                },
                'span ended',
            );
        }
        resultCallback({ code: EXPORT_SUCCESS });
    }

    shutdown() {
        return Promise.resolve();
    }
}

/**
 * Register a global tracer provider with W3C trace-context propagation and an
 * AsyncLocalStorage context manager (both are NodeTracerProvider defaults).
 */
function initTracing(config, logger) {
    const provider = new NodeTracerProvider({
        resource: resourceFromAttributes({
            'service.name': config.serviceName,
            'service.version': config.version,
        }),
        spanProcessors: [new SimpleSpanProcessor(new LogSpanExporter(logger))],
    });
    provider.register();

    return {
        tracer: provider.getTracer(config.serviceName, config.version),
        shutdown: () => provider.shutdown(),
    };
}

module.exports = { initTracing, LogSpanExporter };
