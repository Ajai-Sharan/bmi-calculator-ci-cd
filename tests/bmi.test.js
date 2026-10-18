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

    test('throws error for zero weight', () => {
        expect(() => {
            BMICalculator.calculate(0, 1.75);
        }).toThrow("Weight must be greater than zero");
    });

    test('classifies category boundaries correctly', () => {
        expect(BMICalculator.getCategory(18.4)).toBe("Underweight");
        expect(BMICalculator.getCategory(18.5)).toBe("Normal");
        expect(BMICalculator.getCategory(24.95)).toBe("Normal");
        expect(BMICalculator.getCategory(25)).toBe("Overweight");
        expect(BMICalculator.getCategory(29.95)).toBe("Overweight");
        expect(BMICalculator.getCategory(30)).toBe("Obese");
    });
});