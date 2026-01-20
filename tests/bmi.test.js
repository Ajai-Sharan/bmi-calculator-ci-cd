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
});