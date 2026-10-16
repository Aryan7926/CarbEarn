"""
CarbEarn ML Standalone Prediction Script
Loads the trained Random Forest model and runs test predictions
with confidence scores.
"""

import os
import sys
import joblib
import numpy as np


# Configuration
MODEL_PATH = os.path.join(os.path.dirname(__file__), "model.joblib")


def load_model():
    """Load the trained model from disk."""
    if not os.path.exists(MODEL_PATH):
        print(f"Error: Model file not found at {MODEL_PATH}")
        print("Please run 'python train.py' first to train the model.")
        sys.exit(1)

    model_data = joblib.load(MODEL_PATH)
    print(f"Model loaded from: {MODEL_PATH}")
    print(f"Valid activity types: {list(model_data['activity_mapping'].keys())}")
    return model_data


def predict_impact(model_data, activity_type, quantity, frequency):
    """
    Predict the impact category for a given activity.

    Args:
        model_data: Dict containing model, activity_mapping, etc.
        activity_type: String name of the activity
        quantity: Numeric quantity value
        frequency: Numeric frequency value

    Returns:
        Tuple of (predicted_class, confidence_dict)
    """
    activity_mapping = model_data["activity_mapping"]
    model = model_data["model"]

    if activity_type not in activity_mapping:
        raise ValueError(
            f"Unknown activity type: '{activity_type}'. "
            f"Valid types: {list(activity_mapping.keys())}"
        )

    activity_encoded = activity_mapping[activity_type]
    input_features = np.array([[activity_encoded, quantity, frequency]])

    prediction = model.predict(input_features)[0]
    probabilities = model.predict_proba(input_features)[0]
    class_labels = model.classes_

    confidence = dict(zip(
        [str(c) for c in class_labels],
        [round(float(p) * 100, 1) for p in probabilities]
    ))

    return prediction, confidence


def main():
    """Run test predictions and display results."""
    model_data = load_model()

    # Test cases covering different impact levels
    test_cases = [
        ("Cycling", 5, 2, "Low activity - short cycling twice a week"),
        ("Cycling", 50, 6, "High activity - long cycling 6 times a week"),
        ("Walking", 3, 1, "Low activity - short walk once a week"),
        ("Walking", 25, 7, "High activity - daily long walks"),
        ("Tree Planting", 2, 1, "Low activity - planting 2 trees once a week"),
        ("Tree Planting", 50, 5, "High activity - planting many trees often"),
        ("LED Usage", 10, 3, "Medium activity - LED usage 3 times a week"),
        ("LED Usage", 73, 6, "High activity - heavy LED usage"),
        ("Carpooling", 2, 1, "Low activity - occasional carpooling"),
        ("Carpooling", 82, 7, "High activity - daily heavy carpooling"),
        ("Electricity Saving", 4, 2, "Low activity - small savings"),
        ("Reusable Bottle", 68, 7, "High activity - daily bottle reuse"),
    ]

    print(f"\n{'=' * 70}")
    print("CarbEarn ML Predictions - Random Forest Classifier")
    print(f"{'=' * 70}")

    for activity_type, quantity, frequency, description in test_cases:
        prediction, confidence = predict_impact(
            model_data, activity_type, quantity, frequency
        )

        print(f"\n  {description}")
        print(f"  Input: {activity_type}, quantity={quantity}, frequency={frequency}")
        print(f"  Predicted Impact: {prediction}")
        print(f"  Confidence: {confidence}")

    print(f"\n{'=' * 70}")
    print("All predictions complete.")
    print(f"{'=' * 70}")


if __name__ == "__main__":
    main()