from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
import pandas as pd
import numpy as np
import joblib
import io
import os
from pydantic import BaseModel, ConfigDict, Field
from typing import List, Optional, Union

import shap
from train_model import train_and_save_model

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:5174"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Load Model
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
# Note: updated to isolation_forest_model.pkl based on train_model.py
MODEL_PATH = os.path.join(BASE_DIR, 'model', 'isolation_forest_model.pkl')

print("Loading model artifacts...")
try:
    model = joblib.load(MODEL_PATH)
    print("Artifacts loaded successfully.")
except Exception as e:
    print(f"Error loading artifacts: {e}")
    model = None

# Pydantic Schema for Input Validation
class EmployeeRecord(BaseModel):
    employee_id: Union[str, int] = Field(alias='employee_id')
    name: Union[str, int, float] = Field(alias='name')
    department: Union[str, int, float] = Field(alias='department')
    email: Optional[Union[str, int, float]] = Field(default=None, alias='email')
    phone_number: Optional[Union[str, int, float]] = Field(default=None, alias='phone_number')
    salary: float = Field(alias='salary')
    days_present: Optional[float] = Field(default=None, alias='Days_Present')

    model_config = ConfigDict(extra='ignore', populate_by_name=True, coerce_numbers_to_str=True)

@app.get("/")
def read_root():
    return {"status": "ML Service Running (Isolation Forest)"}

def engineer_features(df_in):
    """
    Apply the same feature engineering steps as during training.
    """
    df_engineered = df_in.copy()
    
    df_engineered['email_filled'] = df_engineered['email'].astype(object)
    mask_email = df_engineered['email_filled'].isna()
    df_engineered.loc[mask_email, 'email_filled'] = 'unknown_email_' + df_engineered.index[mask_email].astype(str)
    
    df_engineered['phone_filled'] = df_engineered['phone_number'].astype(object)
    mask_phone = df_engineered['phone_filled'].isna()
    df_engineered.loc[mask_phone, 'phone_filled'] = 'unknown_phone_' + df_engineered.index[mask_phone].astype(str)
    
    # 1. Email Collisions
    email_counts = df_engineered['email_filled'].value_counts().to_dict()
    df_engineered['Email_Collision_Count'] = df_engineered['email_filled'].map(email_counts)
    
    # 2. Phone Collisions
    phone_counts = df_engineered['phone_filled'].value_counts().to_dict()
    df_engineered['Phone_Collision_Count'] = df_engineered['phone_filled'].map(phone_counts)
    
    # 3. Department Salary Variance
    dept_avg_salary = df_engineered.groupby('department')['salary'].transform('mean')
    df_engineered['Department_Salary_Variance'] = abs(df_engineered['salary'] - dept_avg_salary) / dept_avg_salary
    df_engineered['Department_Salary_Variance'] = df_engineered['Department_Salary_Variance'].fillna(0)
    
    # 4. Profile Completeness
    essential_cols = ['name', 'department', 'email', 'phone_number', 'salary']
    missing_count = df_engineered[essential_cols].isnull().sum(axis=1)
    df_engineered['Profile_Completeness_Percentage'] = 100 - (missing_count / len(essential_cols) * 100)
    
    df_engineered['salary'] = df_engineered['salary'].fillna(0)
    
    # Fill anything else
    df_engineered['Email_Collision_Count'] = df_engineered['Email_Collision_Count'].fillna(1)
    df_engineered['Phone_Collision_Count'] = df_engineered['Phone_Collision_Count'].fillna(1)
    df_engineered['Profile_Completeness_Percentage'] = df_engineered['Profile_Completeness_Percentage'].fillna(100)
    
    return df_engineered

def get_dynamic_shap_explanation(row_idx, shap_vals, feature_names):
    row_shaps = shap_vals[row_idx]
    # We are looking for features that push the Isolation Forest score lower (more anomalous)
    # So we sort by most negative SHAP values
    top_indices = np.argsort(row_shaps)
    
    top_features = []
    for idx in top_indices[:2]: # Get top 2 contributing features
        if row_shaps[idx] < -0.01: # Check if contribution is meaningfully pushing the score to anomaly
            feature_name = feature_names[idx].replace('_', ' ')
            top_features.append(feature_name)
            
    if top_features:
        return " Flagged mainly due to: " + " and ".join(top_features) + "."
    return " Anomalous pattern detected across multiple features."

def generate_determination(row, risk_level, anomaly_score, engineered_data_idx=None):
    """
    Generate automatic determination object with classification, confidence, and reasoning.
    """
    reasoning = []
    confidence = 0
    
    # Base confidence calculation from anomaly score
    if risk_level == 'High':
        confidence = min(95, int(anomaly_score * 100)) if anomaly_score > 0 else 60
    elif risk_level == 'Medium':
        confidence = int(anomaly_score * 100 * 0.7) if anomaly_score > 0 else 40
    else:
        confidence = int(anomaly_score * 100 * 0.3) if anomaly_score > 0 else 20
    
    # Build reasoning based on risk factors
    attendance_days = row.get('Days_Present') or row.get('attendanceDays') or 20
    attendance_rate = (attendance_days / 22) * 100 if attendance_days else 0
    
    # Attendance reasons
    if attendance_days == 0:
        reasoning.append("Zero attendance recorded across biometric logs")
        confidence = min(99, confidence + 15)
    elif attendance_days < 5:
        reasoning.append(f"Critically low attendance rate ({attendance_rate:.1f}%) - below institutional minimum threshold (5%)")
        confidence = min(99, confidence + 10)
    elif attendance_days < 10:
        reasoning.append(f"Significantly reduced attendance rate ({attendance_rate:.1f}%) - potential time theft indicator")
        confidence = min(95, confidence + 5)
    
    # Salary anomalies
    salary_variance = row.get('Department_Salary_Variance', 0)
    if salary_variance and salary_variance > 1.5:
        percentage = int(salary_variance * 100)
        reasoning.append(f"Salary {percentage}% above departmental mean - significant deviation detected")
        confidence = min(95, confidence + 8)
    elif salary_variance and salary_variance > 0.8:
        reasoning.append(f"Salary anomaly detected ({int(salary_variance * 100)}% above mean)")
        confidence = min(90, confidence + 4)
    
    # Email/Phone collisions
    email_collisions = row.get('Email_Collision_Count', 1)
    phone_collisions = row.get('Phone_Collision_Count', 1)
    
    if email_collisions and email_collisions > 1:
        reasoning.append(f"Email address shared with {int(email_collisions - 1)} other employee records - identity duplication risk")
        confidence = min(95, confidence + 10)
    
    if phone_collisions and phone_collisions > 1:
        reasoning.append(f"Phone number shared with {int(phone_collisions - 1)} other employee records - contact info duplication")
        confidence = min(93, confidence + 8)
    
    # Profile completeness
    profile_completeness = row.get('Profile_Completeness_Percentage', 100)
    if profile_completeness and profile_completeness < 50:
        reasoning.append("Critical gaps in employee profile data - incomplete identity verification")
        confidence = min(90, confidence + 7)
    elif profile_completeness and profile_completeness < 80:
        reasoning.append(f"Employee profile {int(profile_completeness)}% complete - missing essential identity markers")
        confidence = min(88, confidence + 4)
    
    # Ensure we have at least one reason
    if not reasoning:
        if risk_level == 'High':
            reasoning.append("Multiple anomalous pattern indicators detected across employee profile")
        elif risk_level == 'Medium':
            reasoning.append("Suspicious activity patterns identified in employee records")
        else:
            reasoning.append("No significant anomalies detected")
    
    # Generate classification
    if risk_level == 'High':
        if attendance_days == 0 or attendance_rate < 5:
            classification = "HIGH RISK GHOST EMPLOYEE"
        else:
            classification = "HIGH RISK ANOMALY DETECTED"
    elif risk_level == 'Medium':
        classification = "MEDIUM RISK - REQUIRES INVESTIGATION"
    else:
        classification = "NORMAL EMPLOYEE PROFILE"
    
    # Ensure confidence is in valid range
    confidence = max(0, min(99, confidence))
    
    return {
        "classification": classification,
        "confidence": confidence,
        "reasoning": reasoning
    }

@app.post("/analyze")
async def analyze_file(payroll_file: UploadFile = File(...), attendance_file: UploadFile = File(...)):
    if model is None:
        return {"status": "error", "error": "Model not loaded"}

    try:
        async def read_df(upload_file):
            contents = await upload_file.read()
            filename = upload_file.filename.lower()
            if filename.endswith(".xlsx") or filename.endswith(".xls"):
                return pd.read_excel(io.BytesIO(contents))
            return pd.read_csv(io.BytesIO(contents))

        df_payroll = await read_df(payroll_file)
        df_attendance = await read_df(attendance_file)

        def find_id_col(df):
            for col in ['employee_id', 'Employee_ID', 'id', 'ID']:
                if col in df.columns:
                    return col
            return None

        pay_id_col = find_id_col(df_payroll)
        att_id_col = find_id_col(df_attendance)

        if not pay_id_col or not att_id_col:
             # Try to just use the first column if names don't match exactly, or just assume employee_id
             return {"status": "error", "error": "Could not find an employee ID column in one or both files."}

        df_payroll = df_payroll.rename(columns={pay_id_col: 'employee_id'})
        df_attendance = df_attendance.rename(columns={att_id_col: 'employee_id'})

        # Merge datasets
        df = pd.merge(df_payroll, df_attendance, on='employee_id', how='left')

        # Optional: standardize common columns like in training
        if 'date_of_hiring' in df.columns:
            df = df.rename(columns={'date_of_hiring': 'hire_date'})
        if 'job_title' in df.columns:
            df = df.rename(columns={'job_title': 'job_titles'})
        
        # Normalize column names to expected aliases used by the Pydantic schema
        # This helps accept CSVs with different header conventions (e.g. 'Name', 'Employee_ID', 'Monthly_Salary')
        col_map = {}
        for col in df.columns:
            key = col.strip()
            key_lower = key.lower()
            # Employee identifier
            if key_lower in ('employee_id', 'employeeid', 'employee id', 'id'):
                col_map[col] = 'employee_id'
                continue
            # Name fields
            if key_lower in ('name', 'full_name', 'full name', 'employee_name', 'employee name'):
                col_map[col] = 'name'
                continue
            # Department
            if key_lower in ('department', 'dept'):
                col_map[col] = 'department'
                continue
            # Email
            if 'email' in key_lower:
                col_map[col] = 'email'
                continue
            # Phone number
            if 'phone' in key_lower or 'telephone' in key_lower:
                col_map[col] = 'phone_number'
                continue
            # Salary variants
            if 'salary' in key_lower or 'monthly_salary' in key_lower or 'monthly salary' in key_lower:
                col_map[col] = 'salary'
                continue
            # Attendance / days present
            if 'days_present' in key_lower or ('days' in key_lower and 'present' in key_lower) or key_lower == 'days':
                col_map[col] = 'Days_Present'
                continue

        if col_map:
            df = df.rename(columns=col_map)
            
    except Exception as e:
        return {"status": "error", "error": f"Failed to read or merge files: {str(e)}"}
    
    records = df.to_dict(orient='records')
    validated_data = []
    errors = []
    
    for i, record in enumerate(records):
        try:
             cleaned_record = {k: (None if pd.isna(v) else v) for k, v in record.items()}
             validated = EmployeeRecord(**cleaned_record)
             validated_data.append(validated.model_dump(by_alias=True))
        except Exception as e:
             errors.append(f"Row {i+1} validation failed: {str(e)[:100]}...")
             
    if not validated_data:
        return {"status": "error", "error": f"Data validation failed. Expected columns: employee_id, name, department, email, phone_number, salary. Errors: {errors[:3]}"}
    
    valid_df = pd.DataFrame(validated_data)
    df_engineered = engineer_features(valid_df)

    features = [
        'salary', 'Email_Collision_Count', 'Phone_Collision_Count',
        'Department_Salary_Variance', 'Profile_Completeness_Percentage'
    ]

    X = df_engineered[features]
    
    predictions = model.predict(X)
    scores = model.decision_function(X)
    
    # SHAP Integration for Dynamic Explanations
    explainer = shap.TreeExplainer(model)
    shap_values = explainer.shap_values(X)
    
    valid_df['Anomaly'] = predictions
    valid_df['Anomaly_Score'] = -scores 
    
    def assign_risk(score):
        if score > 0.05: return 'High'
        if score > 0: return 'Medium'
        return 'Low'

    valid_df['Risk_Level'] = valid_df['Anomaly_Score'].apply(assign_risk)
    
    valid_df['Email_Collision_Count'] = df_engineered['Email_Collision_Count']
    valid_df['Phone_Collision_Count'] = df_engineered['Phone_Collision_Count']
    valid_df['Profile_Completeness_Percentage'] = df_engineered['Profile_Completeness_Percentage']
    valid_df['Department_Salary_Variance'] = df_engineered['Department_Salary_Variance']
    
    # Mapping for Frontend
    valid_df['id'] = valid_df['employee_id']
    valid_df['employeeId'] = valid_df['employee_id']
    valid_df['fullName'] = valid_df['name']
    valid_df['attendanceDays'] = valid_df['Days_Present'].fillna(20) # Use merged attendance data, default 20 if missing
    valid_df['isGhost'] = valid_df['Anomaly'].apply(lambda x: True if x == -1 else False)

    # Dynamic SHAP explanations
    explanations = []
    for idx, row in valid_df.iterrows():
        if row['Anomaly'] == -1:
             explanations.append(get_dynamic_shap_explanation(idx, shap_values, features))
        else:
             explanations.append("Normal behavior detected.")
    
    valid_df['explanation'] = explanations
        
    min_score, max_score = valid_df['Anomaly_Score'].min(), valid_df['Anomaly_Score'].max()
    if max_score > min_score:
         valid_df['Reconstruction_Error'] = (valid_df['Anomaly_Score'] - min_score) / (max_score - min_score)
    else:
         valid_df['Reconstruction_Error'] = 0

    drop_cols = ['Anomaly', 'Anomaly_Score', 'Email_Collision_Count', 'Phone_Collision_Count', 'Profile_Completeness_Percentage', 'Department_Salary_Variance']
    valid_df = valid_df.drop(columns=[col for col in drop_cols if col in valid_df.columns])
    valid_df = valid_df.replace({np.nan: None})
    
    # Generate determination objects for each employee
    results = []
    for idx, record in enumerate(valid_df.to_dict(orient='records')):
        # Reconstruct row with engineered features for determination logic
        engineered_row = df_engineered.iloc[idx].to_dict()
        engineered_row.update(record)
        engineered_row['Risk_Level'] = valid_df.iloc[idx]['Risk_Level']
        engineered_row['Anomaly_Score'] = valid_df.iloc[idx].get('Reconstruction_Error', 0)
        
        # Generate determination
        determination = generate_determination(
            engineered_row,
            valid_df.iloc[idx]['Risk_Level'],
            valid_df.iloc[idx].get('Reconstruction_Error', 0),
            idx
        )
        record['determination'] = determination
        record['risk'] = valid_df.iloc[idx]['Risk_Level']
        results.append(record)
    
    return {"status": "success", "data": results}

@app.post("/retrain")
async def retrain_model(file: UploadFile = File(...)):
    try:
        contents = await file.read()
        additional_df = pd.read_csv(io.BytesIO(contents))
    except Exception as e:
        return {"status": "error", "error": f"Failed to read CSV: {str(e)}"}
    
    print("Initiating automated retraining pipeline...")
    success = train_and_save_model(additional_df)
    if success:
        global model
        try:
            model = joblib.load(MODEL_PATH)
            return {"status": "success", "message": "Model retrained and artifacts reloaded successfully."}
        except Exception as e:
            return {"status": "error", "error": f"Model retrained but failed to reload artifacts: {e}"}
    else:
        return {"status": "error", "error": "Retraining pipeline failed."}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
