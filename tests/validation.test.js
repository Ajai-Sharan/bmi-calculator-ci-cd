const { parseMeasurement, validateBmiQuery } = require('../src/validation');

describe('parseMeasurement', () => {
    test.each([
        ['70', 70],
        ['70.5', 70.5],
        [' 70 ', 70],
        ['.5', undefined],
    ])('weight %p parses to %p', (raw, expected) => {
        const result = parseMeasurement('weight', raw);
        if (expected === undefined) {
            expect(result.error).toMatch(/between 1 and 700 kg/);
        } else {
            expect(result).toEqual({ value: expected });
        }
    });

    test.each(['70abc', '1e2', '0x10', '-70', 'Infinity', 'NaN', '7 0', '12345678901234567'])(
        'rejects malformed value %p',
        (raw) => {
            expect(parseMeasurement('weight', raw).error).toBe("'weight' must be a positive decimal number in kg");
        },
    );

    test('requires a value', () => {
        expect(parseMeasurement('height', undefined).error).toBe("'height' is required");
        expect(parseMeasurement('height', '').error).toBe("'height' is required");
    });

    test('rejects repeated parameters', () => {
        expect(parseMeasurement('height', ['1.7', '1.8']).error).toBe("'height' must be provided exactly once");
    });

    test('enforces ranges and hints at centimetres', () => {
        expect(parseMeasurement('weight', '0').error).toBe("'weight' must be between 1 and 700 kg");
        expect(parseMeasurement('weight', '701').error).toBe("'weight' must be between 1 and 700 kg");
        expect(parseMeasurement('height', '0.2').error).toBe("'height' must be between 0.3 and 3 m");
        expect(parseMeasurement('height', '175').error).toBe(
            "'height' must be between 0.3 and 3 m (height is in metres, not centimetres)",
        );
        expect(parseMeasurement('height', '3')).toEqual({ value: 3 });
    });
});

describe('validateBmiQuery', () => {
    test('returns parsed values for a valid query', () => {
        expect(validateBmiQuery({ weight: '70', height: '1.75' })).toEqual({ values: { weight: 70, height: 1.75 } });
    });

    test('reports every invalid field', () => {
        expect(validateBmiQuery({})).toEqual({
            errors: [
                { field: 'weight', message: "'weight' is required" },
                { field: 'height', message: "'height' is required" },
            ],
        });
    });
});
