const BMICalculator = require('../src/bmi');

describe('BMI Calculator Tests', () => {

    test('calculates BMI correctly for normal values', () => {
        expect(BMICalculator.calculate(70, 1.75)).toBe(22.86);
    });

    test('classifies Normal weight correctly', () => {
        expect(BMICalculator.getCategory(22.86)).toBe("Normal");
    });

    test('classifies Obese correctly', () => {
        expect(BMICalculator.getCategory(35.0)).toBe("Obese");
    });

    test('throws error for zero height', () => {
        expect(() => {
            BMICalculator.calculate(70, 0);
        }).toThrow("Height must be greater than zero");
    });

    test('throws error for zero or negative weight', () => {
        expect(() => BMICalculator.calculate(0, 1.75)).toThrow("Weight must be greater than zero");
        expect(() => BMICalculator.calculate(-5, 1.75)).toThrow("Weight must be greater than zero");
    });

    test('rejects non-finite inputs', () => {
        expect(() => BMICalculator.calculate(NaN, 1.75)).toThrow("Weight must be greater than zero");
        expect(() => BMICalculator.calculate(70, Infinity)).toThrow("Height must be greater than zero");
    });

    test.each([
        [18.49, 'Underweight'],
        [18.5, 'Normal'],
        [24.9, 'Normal'],
        [24.95, 'Normal'],
        [25, 'Overweight'],
        [29.9, 'Overweight'],
        [29.95, 'Overweight'],
        [30, 'Obese'],
    ])('classifies boundary BMI %p as %s', (bmi, category) => {
        expect(BMICalculator.getCategory(bmi)).toBe(category);
    });

    test('rejects invalid BMI values when categorising', () => {
        expect(() => BMICalculator.getCategory(NaN)).toThrow("BMI must be a positive number");
        expect(() => BMICalculator.getCategory(0)).toThrow("BMI must be a positive number");
    });
});
