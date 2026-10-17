import os
import joblib
import pandas as pd
from sklearn.ensemble import RandomForestClassifier

# Training data matching our exact feature vector:
# [attendance_rate, submission_rate, avg_grade, engagement_count]
data = [
    # Low Risk (High attendance, high grades, active engagement)
    [0.95, 1.00, 88.0, 15, "low"],
    [0.90, 0.90, 82.0, 10, "low"],
    [1.00, 1.00, 95.0, 20, "low"],
    [0.85, 0.95, 78.0, 8, "low"],
    
    # Medium Risk (Moderate attendance/grades, sporadic engagement)
    [0.70, 0.80, 65.0, 4, "medium"],
    [0.65, 0.75, 60.0, 3, "medium"],
    [0.75, 0.70, 68.0, 5, "medium"],
    [0.60, 0.85, 58.0, 2, "medium"],

    # High Risk (Low attendance, missing submissions, low grades, low engagement)
    [0.30, 0.40, 40.0, 0, "high"],
    [0.40, 0.30, 35.0, 1, "high"],
    [0.20, 0.50, 45.0, 0, "high"],
    [0.10, 0.20, 25.0, 0, "high"],
]

df = pd.DataFrame(data, columns=["attendance_rate", "submission_rate", "avg_grade", "engagement_count", "risk_level"])

X = df[["attendance_rate", "submission_rate", "avg_grade", "engagement_count"]]
y = df["risk_level"]

clf = RandomForestClassifier(n_estimators=50, random_state=42)
clf.fit(X, y)

# Save inside app/ml/ directory
os.makedirs("app/ml", exist_ok=True)
model_path = "app/ml/risk_model.pkl"
joblib.dump(clf, model_path)

print(f"✅ Random Forest model successfully saved to {model_path}")