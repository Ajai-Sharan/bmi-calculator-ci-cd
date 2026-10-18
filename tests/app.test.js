const request = require('supertest');
const { Writable } = require('stream');
const { loadConfig } = require('../src/config');
const { createLogger } = require('../src/logger');
const { createMetrics } = require('../src/metrics');
const { initTracing } = require('../src/tracing');
const { createApp, createMetricsApp } = require('../src/app');
const BMICalculator = require('../src/bmi');

// Capture log lines in memory so tests can assert on structured output.
const logLines = [];
const sink = new Writable({
    write(chunk, _encoding, callback) {
        logLines.push(JSON.parse(chunk.toString()));
        callback();
    },
});

const config = loadConfig({ APP_VERSION: 'test-sha', LOG_LEVEL: 'debug' });
const logger = createLogger(config, sink);
const { tracer } = initTracing(config, logger);

function build({ ready = true } = {}) {
    const metrics = createMetrics(config);
    const app = createApp({ config, logger, metrics, tracer, isReady: () => ready });
    return { app, metrics };
}

beforeEach(() => {
    logLines.length = 0;
});

describe('health endpoints', () => {
    test('GET /health reports UP with the running version', async () => {
        const res = await request(build().app).get('/health');
        expect(res.status).toBe(200);
        expect(res.body).toEqual({ status: 'UP', version: 'test-sha' });
    });

    test('GET /ready reflects readiness state', async () => {
        expect((await request(build().app).get('/ready')).status).toBe(200);
        const res = await request(build({ ready: false }).app).get('/ready');
        expect(res.status).toBe(503);
        expect(res.body).toEqual({ status: 'NOT_READY' });
    });
});

describe('GET /bmi', () => {
    test('returns BMI and category for valid input', async () => {
        const res = await request(build().app).get('/bmi?weight=70&height=1.75');
        expect(res.status).toBe(200);
        expect(res.body).toEqual({ weight: 70, height: 1.75, bmi: 22.86, category: 'Normal' });
    });

    test.each([
        ['', "'weight' is required; 'height' is required"],
        ['?weight=70', "'height' is required"],
        ['?weight=70abc&height=1.75', "'weight' must be a positive decimal number in kg"],
        ['?weight=70&height=0', "'height' must be between 0.3 and 3 m"],
        ['?weight=-70&height=1.75', "'weight' must be a positive decimal number in kg"],
        ['?weight=70&height=175', "'height' must be between 0.3 and 3 m (height is in metres, not centimetres)"],
        ['?weight=70&weight=80&height=1.75', "'weight' must be provided exactly once"],
    ])('rejects %p with 400', async (query, message) => {
        const res = await request(build().app).get(`/bmi${query}`);
        expect(res.status).toBe(400);
        expect(res.body.error).toBe(message);
        expect(res.body.traceId).toMatch(/^[0-9a-f]{32}$/);
    });

    test('returns a JSON 500 with a trace id when calculation fails unexpectedly', async () => {
        const spy = jest.spyOn(BMICalculator, 'calculate').mockImplementation(() => {
            throw new Error('boom');
        });
        try {
            const res = await request(build().app).get('/bmi?weight=70&height=1.75');
            expect(res.status).toBe(500);
            expect(res.body).toEqual({ error: 'Internal server error', traceId: expect.stringMatching(/^[0-9a-f]{32}$/) });
            expect(logLines.some((l) => l.level === 'error' && l.msg === 'unhandled error' && l.err.message === 'boom')).toBe(true);
        } finally {
            spy.mockRestore();
        }
    });
});

describe('cross-cutting behaviour', () => {
    test('unknown routes return JSON 404', async () => {
        const res = await request(build().app).get('/nope');
        expect(res.status).toBe(404);
        expect(res.body.error).toBe('Not found');
    });

    test('does not advertise the framework and sets safe headers', async () => {
        const res = await request(build().app).get('/health');
        expect(res.headers['x-powered-by']).toBeUndefined();
        expect(res.headers['x-content-type-options']).toBe('nosniff');
    });

    test('continues an incoming W3C trace and correlates logs and spans', async () => {
        const traceId = '4bf92f3577b34da6a3ce929d0e0e4736';
        const res = await request(build().app)
            .get('/bmi?weight=70&height=1.75')
            .set('traceparent', `00-${traceId}-00f067aa0ba902b7-01`);

        expect(res.headers['x-trace-id']).toBe(traceId);
        expect(res.headers.traceparent).toMatch(new RegExp(`^00-${traceId}-[0-9a-f]{16}-01$`));

        const access = logLines.find((l) => l.type === 'access');
        expect(access).toMatchObject({ trace_id: traceId, route: '/bmi', status: 200, version: 'test-sha' });

        const spans = logLines.filter((l) => l.type === 'span');
        expect(spans.map((s) => s.span_name).sort()).toEqual(['GET /bmi', 'bmi.calculate', 'bmi.validate']);
        const server = spans.find((s) => s.span_name === 'GET /bmi');
        expect(server.parent_span_id).toBe('00f067aa0ba902b7');
        for (const child of spans.filter((s) => s.span_name.startsWith('bmi.'))) {
            expect(child.trace_id).toBe(traceId);
            expect(child.parent_span_id).toBe(server.span_id);
        }
    });

    test('probe requests are not traced', async () => {
        const res = await request(build().app).get('/health');
        expect(res.headers['x-trace-id']).toBeUndefined();
        expect(logLines.filter((l) => l.type === 'span')).toHaveLength(0);
    });
});

describe('metrics endpoint', () => {
    test('exposes Prometheus metrics for requests and BMI outcomes', async () => {
        const { app, metrics } = build();
        await request(app).get('/bmi?weight=70&height=1.75');
        await request(app).get('/bmi?weight=abc&height=1.75');

        const res = await request(createMetricsApp(metrics.registry)).get('/metrics');
        expect(res.status).toBe(200);
        expect(res.headers['content-type']).toMatch(/text\/plain/);
        expect(res.text).toMatch(/http_requests_total\{method="GET",route="\/bmi",status_code="200",service="bmi-calculator-api"\} 1/);
        expect(res.text).toMatch(/http_requests_total\{method="GET",route="\/bmi",status_code="400",service="bmi-calculator-api"\} 1/);
        expect(res.text).toMatch(/bmi_calculations_total\{category="Normal",service="bmi-calculator-api"\} 1/);
        expect(res.text).toMatch(/bmi_validation_failures_total\{field="weight",service="bmi-calculator-api"\} 1/);
        expect(res.text).toMatch(/app_info\{version="test-sha",service="bmi-calculator-api"\} 1/);
        expect(res.text).toMatch(/http_request_duration_seconds_bucket/);
        expect(res.text).toMatch(/process_cpu_user_seconds_total/);
    });
});
