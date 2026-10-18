const request = require('supertest');
const app = require('../src/app');

describe('BMI API Tests', () => {

    test('GET /health returns UP and the running version', async () => {
        const res = await request(app).get('/health');
        expect(res.status).toBe(200);
        expect(res.body.status).toBe('UP');
        expect(res.body).toHaveProperty('version');
    });

    test('GET /bmi returns BMI and category for valid input', async () => {
        const res = await request(app).get('/bmi?weight=70&height=1.75');
        expect(res.status).toBe(200);
        expect(res.body).toEqual({ weight: 70, height: 1.75, bmi: 22.86, category: 'Normal' });
    });

    test.each([
        ['missing parameters', ''],
        ['missing height', '?weight=70'],
        ['text after the number', '?weight=70abc&height=1.75'],
        ['negative weight', '?weight=-70&height=1.75'],
        ['zero height', '?weight=70&height=0'],
        ['height in centimetres', '?weight=70&height=175'],
        ['weight too large', '?weight=900&height=1.75'],
        ['repeated parameter', '?weight=70&weight=80&height=1.75'],
    ])('GET /bmi rejects %s with 400', async (_name, query) => {
        const res = await request(app).get(`/bmi${query}`);
        expect(res.status).toBe(400);
        expect(res.body.error).toBeDefined();
        expect(res.body.traceId).toMatch(/^[0-9a-f]{32}$/);
    });

    test('unknown routes return 404 JSON', async () => {
        const res = await request(app).get('/does-not-exist');
        expect(res.status).toBe(404);
        expect(res.body.error).toBe('Not found');
    });

    test('continues the trace id sent by the caller (W3C traceparent)', async () => {
        const traceId = '4bf92f3577b34da6a3ce929d0e0e4736';
        const res = await request(app)
            .get('/bmi?weight=70&height=1.75')
            .set('traceparent', `00-${traceId}-00f067aa0ba902b7-01`);
        expect(res.headers['x-trace-id']).toBe(traceId);
        expect(res.headers.traceparent).toMatch(new RegExp(`^00-${traceId}-[0-9a-f]{16}-01$`));
    });

    test('does not expose the X-Powered-By header', async () => {
        const res = await request(app).get('/health');
        expect(res.headers['x-powered-by']).toBeUndefined();
    });

    test('GET /metrics exposes Prometheus metrics', async () => {
        await request(app).get('/bmi?weight=70&height=1.75');
        const res = await request(app).get('/metrics');
        expect(res.status).toBe(200);
        expect(res.text).toMatch(/http_requests_total\{method="GET",route="\/bmi",status="200"\}/);
        expect(res.text).toMatch(/http_request_duration_seconds_bucket/);
    });
});
