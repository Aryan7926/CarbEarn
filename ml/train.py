"""
CarbEarn ML Training Pipeline
Trains a Random Forest classifier to predict activity impact (Low/Medium/High)
based on activity type, quantity, and frequency.
"""

import pandas as pd
import numpy as np
import joblib
import os
import json
from sklearn.model_selection import train_test_split, cross_val_score
from sklearn.ensemble import RandomForestClassifier
from sklearn.preprocessing import LabelEncoder
from sklearn.metrics import (
    accuracy_score, classification_report, confusion_matrix, f1_score
)


# Configuration
DATASET_PATH = os.path.join(os.path.dirname(__file__), "dataset.csv")
MODEL_PATH = os.path.join(os.path.dirname(__file__), "model.joblib")
METADATA_PATH = os.path.join(os.path.dirname(__file__), "model_metadata.json")
RANDOM_STATE = 42
TEST_SIZE = 0.2


def load_and_explore_data():
    """Load dataset and print exploration summary."""
    print("=" * 60)
    print("CarbEarn ML Training Pipeline - Random Forest Classifier")
    print("=" * 60)

    data = pd.read_csv(DATASET_PATH)

    print(f"\nDataset Overview:")
    print(f"  Total samples: {len(data)}")
    print(f"  Features: {list(data.columns)}")
    print(f"  Missing values: {data.isnull().sum().sum()}")
    print(f"  Duplicates: {data.duplicated().sum()}")

    print(f"\nClass Distribution (impact):")
    class_dist = data['impact'].value_counts()
    for label, count in class_dist.items():
        print(f"  {label}: {count} ({count/len(data)*100:.1f}%)")

    print(f"\nActivity Types:")
    for activity in sorted(data['activity_type'].unique()):
        count = len(data[data['activity_type'] == activity])
        print(f"  {activity}: {count} samples")

    print(f"\nFeature Statistics:")
    print(data[['quantity', 'frequency']].describe().to_string())

    return data


def preprocess_data(data):
    """Encode categorical features and prepare train/test splits."""

    # Remove duplicates
    data = data.drop_duplicates().reset_index(drop=True)
    print(f"\nAfter removing duplicates: {len(data)} samples")

    # Encode activity_type
    activity_encoder = LabelEncoder()
    data['activity_encoded'] = activity_encoder.fit_transform(data['activity_type'])

    # Create activity mapping for reference
    activity_mapping = dict(zip(
        activity_encoder.classes_,
        activity_encoder.transform(activity_encoder.classes_)
    ))

    # Features and target
    feature_columns = ['activity_encoded', 'quantity', 'frequency']
    X = data[feature_columns].values
    y = data['impact'].values

    # Split with stratification
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=TEST_SIZE, random_state=RANDOM_STATE, stratify=y
    )

    print(f"\nTrain/Test Split:")
    print(f"  Training samples: {len(X_train)}")
    print(f"  Testing samples: {len(X_test)}")

    return X_train, X_test, y_train, y_test, activity_encoder, activity_mapping, feature_columns


def train_model(X_train, y_train):
    """Train Random Forest with tuned hyperparameters."""
    print(f"\nTraining Random Forest Classifier...")

    model = RandomForestClassifier(
        n_estimators=100,
        max_depth=10,
        min_samples_split=5,
        min_samples_leaf=2,
        max_features='sqrt',
        random_state=RANDOM_STATE,
        n_jobs=-1,
        class_weight='balanced'
    )

    model.fit(X_train, y_train)

    # Cross-validation on training data
    cv_scores = cross_val_score(model, X_train, y_train, cv=5, scoring='accuracy')
    print(f"\n5-Fold Cross-Validation Accuracy:")
    print(f"  Mean: {cv_scores.mean()*100:.2f}%")
    print(f"  Std:  {cv_scores.std()*100:.2f}%")
    print(f"  Scores: {[f'{s*100:.1f}%' for s in cv_scores]}")

    return model


def evaluate_model(model, X_test, y_test, feature_columns):
    """Evaluate model on held-out test set."""
    print(f"\n{'=' * 60}")
    print("Model Evaluation on Test Set")
    print(f"{'=' * 60}")

    y_pred = model.predict(X_test)

    accuracy = accuracy_score(y_test, y_pred)
    f1 = f1_score(y_test, y_pred, average='weighted')

    print(f"\nAccuracy: {accuracy*100:.2f}%")
    print(f"Weighted F1-Score: {f1*100:.2f}%")

    print(f"\nClassification Report:")
    print(classification_report(y_test, y_pred, zero_division=0))

    print(f"Confusion Matrix:")
    labels = sorted(set(y_test) | set(y_pred))
    cm = confusion_matrix(y_test, y_pred, labels=labels)
    print(f"  Labels: {labels}")
    for i, row in enumerate(cm):
        print(f"  {labels[i]:>8}: {row}")

    # Feature importance
    print(f"\nFeature Importance:")
    importances = model.feature_importances_
    for feat, imp in sorted(zip(feature_columns, importances), key=lambda x: -x[1]):
        print(f"  {feat}: {imp:.4f}")

    return {
        'accuracy': float(accuracy),
        'f1_weighted': float(f1),
        'classification_report': classification_report(y_test, y_pred, output_dict=True, zero_division=0),
        'feature_importances': dict(zip(feature_columns, [float(i) for i in importances]))
    }


def save_model(model, activity_encoder, activity_mapping, metrics, feature_columns):
    """Save model and metadata."""

    # Save model with joblib (safer than pickle for sklearn)
    model_data = {
        'model': model,
        'activity_encoder': activity_encoder,
        'activity_mapping': activity_mapping,
        'feature_columns': feature_columns
    }
    joblib.dump(model_data, MODEL_PATH)
    print(f"\nModel saved to: {MODEL_PATH}")

    # Save metadata as JSON
    metadata = {
        'algorithm': 'RandomForestClassifier',
        'n_estimators': 100,
        'max_depth': 10,
        'feature_columns': feature_columns,
        'activity_mapping': {k: int(v) for k, v in activity_mapping.items()},
        'target_classes': ['Low', 'Medium', 'High'],
        'metrics': metrics,
        'dataset_note': (
            'This model is trained on a synthetic dataset of 500 samples. '
            'Predictions are approximate impact classifications, not measured CO2 values. '
            'The dataset is small and may not generalize to all real-world scenarios.'
        )
    }
    with open(METADATA_PATH, 'w') as f:
        json.dump(metadata, f, indent=2)
    print(f"Metadata saved to: {METADATA_PATH}")


def main():
    data = load_and_explore_data()
    X_train, X_test, y_train, y_test, activity_encoder, activity_mapping, feature_columns = preprocess_data(data)
    model = train_model(X_train, y_train)
    metrics = evaluate_model(model, X_test, y_test, feature_columns)
    save_model(model, activity_encoder, activity_mapping, metrics, feature_columns)

    print(f"\n{'=' * 60}")
    print("Training complete!")
    print(f"{'=' * 60}")


if __name__ == "__main__":
    main()