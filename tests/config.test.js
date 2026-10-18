const { loadConfig } = require('../src/config');

describe('loadConfig', () => {
    test('uses defaults when nothing is set', () => {
        expect(loadConfig({})).toEqual({
            port: 3000,
            metricsPort: 9464,
            logLevel: 'info',
            serviceName: 'bmi-calculator-api',
            version: 'dev',
        });
    });

    test('reads values from the environment', () => {
        const config = loadConfig({ PORT: '8080', METRICS_PORT: '9100', LOG_LEVEL: 'debug', APP_VERSION: 'abc123' });
        expect(config).toMatchObject({ port: 8080, metricsPort: 9100, logLevel: 'debug', version: 'abc123' });
    });

    test.each(['0', '65536', 'abc', '3000.5', '-1'])('rejects invalid PORT %p', (port) => {
        expect(() => loadConfig({ PORT: port })).toThrow(/PORT must be an integer between 1 and 65535/);
    });

    test('rejects clashing ports', () => {
        expect(() => loadConfig({ PORT: '9464' })).toThrow('PORT and METRICS_PORT must be different');
    });

    test('rejects unknown log levels', () => {
        expect(() => loadConfig({ LOG_LEVEL: 'verbose' })).toThrow(/LOG_LEVEL must be one of/);
    });
});
