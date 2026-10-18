class BMICalculator {

    /**
     * Calculate BMI given weight (kg) and height (m).
     */
    static calculate(weight, height) {
        if (!Number.isFinite(height) || height <= 0) {
            throw new Error("Height must be greater than zero");
        }
        if (!Number.isFinite(weight) || weight <= 0) {
            throw new Error("Weight must be greater than zero");
        }

        const bmi = weight / (height * height);
        // Return BMI rounded to 2 decimal places
        return parseFloat(bmi.toFixed(2));
    }

    /**
     * Return the WHO adult category for a given BMI value.
     * Upper bounds are exclusive so values such as 24.95 or 29.95 fall into
     * the correct band (the original 24.9/29.9 bounds left gaps).
     */
    static getCategory(bmi) {
        if (!Number.isFinite(bmi) || bmi <= 0) {
            throw new Error("BMI must be a positive number");
        }
        if (bmi < 18.5) {
            return "Underweight";
        } else if (bmi < 25) {
            return "Normal";
        } else if (bmi < 30) {
            return "Overweight";
        } else {
            return "Obese";
        }
    }
}

// Export the class for usage in tests
module.exports = BMICalculator;

// Simple command-line execution example (optional)
if (require.main === module) {
    try {
        const weight = 70; // Hardcoded example
        const height = 1.75;
        const bmi = BMICalculator.calculate(weight, height);
        console.log(`BMI: ${bmi}`);
        console.log(`Category: ${BMICalculator.getCategory(bmi)}`);
    } catch (error) {
        console.error(`Error: ${error.message}`);
    }
}
