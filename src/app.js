const express = require('express');
const BMICalculator = require('./bmi');
const { register, log, requestObserver } = require('./observability');

const app = express();
app.disable('x-powered-by'); // do not advertise the framework
app.use(requestObserver);    // metrics, trace id and request log for every request

app.get('/health', (req, res) => {
    // version = the git commit SHA baked into the image, so the running version is traceable
    res.status(200).json({ status: 'UP', version: process.env.APP_VERSION || 'dev' });
});

app.get('/metrics', async (req, res) => {
    res.set('Content-Type', register.contentType);
    res.send(await register.metrics());
});

// Accept plain positive decimals only ("70", "1.75").
// parseFloat would accept "70abc" as 70, so a regex is used instead.
function toNumber(value) {
    if (typeof value !== 'string' || !/^\d+(\.\d+)?$/.test(value)) {
        return NaN;
    }
    return Number(value);
}

// Endpoint: GET /bmi?weight=70&height=1.75
app.get('/bmi', (req, res) => {
    if (req.query.weight === undefined || req.query.height === undefined) {
        return res.status(400).json({ error: "Please provide 'weight' and 'height' query parameters.", traceId: req.traceId });
    }

    const weight = toNumber(req.query.weight);
    const height = toNumber(req.query.height);

    if (Number.isNaN(weight) || Number.isNaN(height)) {
        return res.status(400).json({ error: "'weight' and 'height' must be positive numbers, e.g. /bmi?weight=70&height=1.75", traceId: req.traceId });
    }
    if (weight < 1 || weight > 700) {
        return res.status(400).json({ error: "'weight' must be between 1 and 700 kg", traceId: req.traceId });
    }
    if (height < 0.3 || height > 3) {
        return res.status(400).json({ error: "'height' must be between 0.3 and 3 metres (not centimetres)", traceId: req.traceId });
    }

    const bmi = BMICalculator.calculate(weight, height);
    res.json({ weight, height, bmi, category: BMICalculator.getCategory(bmi) });
});

app.use((req, res) => {
    res.status(404).json({ error: 'Not found', traceId: req.traceId });
});

// Unexpected errors: log details, return a generic message (no stack trace to the client).
app.use((err, req, res, _next) => {
    log('error', 'unhandled error', { trace_id: req.traceId, error: err.message, stack: err.stack });
    res.status(500).json({ error: 'Internal server error', traceId: req.traceId });
});

module.exports = app;
