const express = require('express');
const BMICalculator = require('./bmi');

const app = express();
const PORT = 3000;

app.use(express.json());

app.get('/health', (req, res) => {
    res.status(200).json({ status: 'UP' });
});

// Endpoint: GET /bmi?weight=70&height=1.75
app.get('/bmi', (req, res) => {
    try {
        const weight = parseFloat(req.query.weight);
        const height = parseFloat(req.query.height);

        if (!weight || !height) {
            return res.status(400).json({ error: "Please provide 'weight' and 'height' query parameters." });
        }

        const bmiValue = BMICalculator.calculate(weight, height);
        const category = BMICalculator.getCategory(bmiValue);

        res.json({
            weight: weight,
            height: height,
            bmi: bmiValue,
            category: category
        });

    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});