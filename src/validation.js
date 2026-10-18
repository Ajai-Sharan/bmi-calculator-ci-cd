// Accepted ranges for adult measurements. Values outside these bounds are
// almost always unit mistakes (e.g. height in centimetres) rather than real input.
const LIMITS = {
    weight: { min: 1, max: 700, unit: 'kg' },
    height: { min: 0.3, max: 3, unit: 'm' },
};

// Plain positive decimals only: rejects "70abc", "1e2", "0x10", "-5", "Infinity".
const DECIMAL_PATTERN = /^(?:\d+(?:\.\d+)?|\.\d+)$/;
const MAX_LENGTH = 16;

/**
 * Parse one query-string measurement. Returns { value } or { error }.
 */
function parseMeasurement(field, raw) {
    const { min, max, unit } = LIMITS[field];

    if (raw === undefined || raw === '') {
        return { error: `'${field}' is required` };
    }
    if (typeof raw !== 'string') {
        return { error: `'${field}' must be provided exactly once` };
    }

    const trimmed = raw.trim();
    if (trimmed.length > MAX_LENGTH || !DECIMAL_PATTERN.test(trimmed)) {
        return { error: `'${field}' must be a positive decimal number in ${unit}` };
    }

    const value = Number(trimmed);
    if (value < min || value > max) {
        let message = `'${field}' must be between ${min} and ${max} ${unit}`;
        if (field === 'height' && value > max && value <= 300) {
            message += ' (height is in metres, not centimetres)';
        }
        return { error: message };
    }

    return { value };
}

/**
 * Validate the /bmi query. Returns { values: { weight, height } } or { errors: [{ field, message }] }.
 */
function validateBmiQuery(query) {
    const errors = [];
    const values = {};

    for (const field of Object.keys(LIMITS)) {
        const result = parseMeasurement(field, query[field]);
        if (result.error) {
            errors.push({ field, message: result.error });
        } else {
            values[field] = result.value;
        }
    }

    return errors.length > 0 ? { errors } : { values };
}

module.exports = { LIMITS, parseMeasurement, validateBmiQuery };
