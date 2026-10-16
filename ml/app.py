"""
CarbEarn ML Prediction Service
Flask API serving Random Forest predictions for activity impact classification.
"""

import os
import joblib
import numpy as np
import pandas as pd
from flask import Flask, request, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

# Load model
MODEL_PATH = os.path.join(os.path.dirname(__file__), "model.joblib")
model_data = None


def load_model():
    global model_data
    try:
        model_data = joblib.load(MODEL_PATH)
        print(f"Model loaded successfully from {MODEL_PATH}")
        print(f"Activity mapping: {model_data['activity_mapping']}")
    except Exception as e:
        print(f"Warning: Could not load model: {e}")
        print("Run 'python train.py' first to train the model.")


load_model()


@app.route("/")
def home():
    return jsonify({
        "service": "CarbEarn ML Prediction API",
        "status": "running",
        "model_loaded": model_data is not None,
        "endpoints": {
            "POST /predict": "Predict activity impact",
            "GET /health": "Health check"
        }
    })


@app.route("/health")
def health():
    return jsonify({
        "status": "healthy",
        "model_loaded": model_data is not None
    })


@app.route("/predict", methods=["POST"])
def predict():
    if model_data is None:
        return jsonify({
            "error": "Model not loaded. Please train the model first."
        }), 503

    try:
        data = request.get_json()
        if not data:
            return jsonify({"error": "Request body is required"}), 400

        activity_type = data.get("activity_type")
        quantity = data.get("quantity")
        frequency = data.get("frequency")

        # Validate inputs
        if not activity_type:
            return jsonify({"error": "activity_type is required"}), 400
        if quantity is None or frequency is None:
            return jsonify({"error": "quantity and frequency are required"}), 400

        try:
            quantity = float(quantity)
            frequency = float(frequency)
        except (ValueError, TypeError):
            return jsonify({"error": "quantity and frequency must be numbers"}), 400

        if quantity <= 0 or frequency <= 0:
            return jsonify({"error": "quantity and frequency must be positive"}), 400

        # Check activity type
        activity_mapping = model_data["activity_mapping"]
        if activity_type not in activity_mapping:
            return jsonify({
                "error": f"Unknown activity type: {activity_type}",
                "valid_types": list(activity_mapping.keys())
            }), 400

        # Prepare input
        activity_encoded = activity_mapping[activity_type]
        model = model_data["model"]

        input_features = np.array([[activity_encoded, quantity, frequency]])

        # Predict
        prediction = model.predict(input_features)[0]
        probabilities = model.predict_proba(input_features)[0]
        class_labels = model.classes_

        confidence = dict(zip(
            [str(c) for c in class_labels],
            [round(float(p) * 100, 1) for p in probabilities]
        ))

        return jsonify({
            "activity_type": activity_type,
            "quantity": quantity,
            "frequency": frequency,
            "predicted_impact": str(prediction),
            "confidence": confidence,
            "note": "This prediction is based on a classification model trained on synthetic data. It represents an estimated impact category, not a measured CO2 value."
        })

    except Exception as e:
        print(f"Prediction error: {e}")
        return jsonify({"error": "Prediction failed"}), 500


if __name__ == "__main__":
    host = os.environ.get("ML_HOST", "0.0.0.0")
    port = int(os.environ.get("ML_PORT", 5001))
    debug = os.environ.get("ML_DEBUG", "true").lower() == "true"

    app.run(host=host, port=port, debug=debug)