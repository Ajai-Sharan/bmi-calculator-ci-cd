const express = require('express');
const { context, propagation, trace, SpanKind, SpanStatusCode } = require('@opentelemetry/api');
const BMICalculator = require('./bmi');
const { validateBmiQuery } = require('./validation');

// Probe traffic is counted in metrics but not traced, and only logged at debug
// level, so kubelet checks every few seconds do not drown out real requests.
const PROBE_PATHS = new Set(['/health', '/ready']);

function traceIdOf(span) {
    return span ? span.spanContext().traceId : undefined;
}

/**
 * Per-request observability: a SERVER span (continuing an incoming W3C
 * traceparent if present), RED metrics and one structured access log line.
 */
function observe({ logger, metrics, tracer }) {
    return (req, res, next) => {
        const start = process.hrtime.bigint();
        const isProbe = PROBE_PATHS.has(req.path);
        const parentContext = propagation.extract(context.active(), req.headers);
        const span = isProbe
            ? undefined
            : tracer.startSpan(`${req.method} ${req.path}`, {
                kind: SpanKind.SERVER,
                attributes: { 'http.request.method': req.method, 'url.path': req.path },
            }, parentContext);

        if (span) {
            const { traceId, spanId, traceFlags } = span.spanContext();
            res.setHeader('traceparent', `00-${traceId}-${spanId}-0${traceFlags}`);
            res.setHeader('x-trace-id', traceId);
        }

        res.on('finish', () => {
            const durationSeconds = Number(process.hrtime.bigint() - start) / 1e9;
            const route = req.route ? req.route.path : 'unmatched';
            const labels = { method: req.method, route, status_code: String(res.statusCode) };
            metrics.httpRequests.inc(labels);
            metrics.httpDuration.observe(labels, durationSeconds);

            const entry = {
                type: 'access',
                trace_id: traceIdOf(span),
                method: req.method,
                route,
                path: req.path,
                status: res.statusCode,
                duration_ms: Math.round(durationSeconds * 1e6) / 1e3,
                user_agent: req.get('user-agent'),
            };
            if (res.statusCode >= 500) {
                logger.error(entry, 'request failed');
            } else if (isProbe) {
                logger.debug(entry, 'probe');
            } else {
                logger.info(entry, 'request completed');
            }

            if (span) {
                span.updateName(`${req.method} ${route}`);
                span.setAttributes({ 'http.route': route, 'http.response.status_code': res.statusCode });
                if (res.statusCode >= 500) {
                    span.setStatus({ code: SpanStatusCode.ERROR });
                }
                span.end();
            }
        });

        if (!span) {
            return next();
        }
        return context.with(trace.setSpan(parentContext, span), next);
    };
}

/**
 * Run fn inside a child span named `name`, ending it even if fn throws.
 */
function inSpan(tracer, name, fn) {
    return tracer.startActiveSpan(name, (span) => {
        try {
            return fn(span);
        } catch (error) {
            span.recordException(error);
            span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
            throw error;
        } finally {
            span.end();
        }
    });
}

function createApp({ config, logger, metrics, tracer, isReady = () => true }) {
    const app = express();
    app.disable('x-powered-by');

    app.use((req, res, next) => {
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Cache-Control', 'no-store');
        next();
    });
    app.use(observe({ logger, metrics, tracer }));

    // Liveness: the process is up and the event loop is responsive.
    app.get('/health', (req, res) => {
        res.status(200).json({ status: 'UP', version: config.version });
    });

    // Readiness: false while starting or draining, so Kubernetes stops routing traffic.
    app.get('/ready', (req, res) => {
        if (isReady()) {
            return res.status(200).json({ status: 'READY' });
        }
        return res.status(503).json({ status: 'NOT_READY' });
    });

    // Endpoint: GET /bmi?weight=70&height=1.75
    app.get('/bmi', (req, res) => {
        const traceId = traceIdOf(trace.getActiveSpan());
        const result = inSpan(tracer, 'bmi.validate', (span) => {
            const validation = validateBmiQuery(req.query);
            span.setAttribute('bmi.valid', !validation.errors);
            return validation;
        });

        if (result.errors) {
            for (const { field } of result.errors) {
                metrics.validationFailures.inc({ field });
            }
            logger.warn({ type: 'validation', errors: result.errors }, 'invalid BMI request');
            return res.status(400).json({
                error: result.errors.map((e) => e.message).join('; '),
                details: result.errors,
                traceId,
            });
        }

        const { weight, height } = result.values;
        const { bmi, category } = inSpan(tracer, 'bmi.calculate', (span) => {
            const bmiValue = BMICalculator.calculate(weight, height);
            const bmiCategory = BMICalculator.getCategory(bmiValue);
            span.setAttributes({ 'bmi.value': bmiValue, 'bmi.category': bmiCategory });
            return { bmi: bmiValue, category: bmiCategory };
        });
        metrics.bmiCalculations.inc({ category });

        return res.json({ weight, height, bmi, category });
    });

    app.use((req, res) => {
        res.status(404).json({ error: 'Not found', traceId: traceIdOf(trace.getActiveSpan()) });
    });

    // Express 5 forwards sync throws and rejected promises here.
    app.use((err, req, res, _next) => {
        const span = trace.getActiveSpan();
        if (span) {
            span.recordException(err);
        }
        logger.error({ type: 'error', err, path: req.path }, 'unhandled error');
        res.status(500).json({ error: 'Internal server error', traceId: traceIdOf(span) });
    });

    return app;
}

/**
 * Metrics are served on their own port so they can be scraped inside the
 * cluster without being exposed through the public Service.
 */
function createMetricsApp(registry) {
    const app = express();
    app.disable('x-powered-by');
    app.get('/metrics', async (req, res) => {
        res.set('Content-Type', registry.contentType);
        res.send(await registry.metrics());
    });
    return app;
}

module.exports = { createApp, createMetricsApp };
