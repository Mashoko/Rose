from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
import pandas as pd
import numpy as np
import joblib
import io
import os
from pydantic import BaseModel, condecimal, ConfigDict, Field
from typing import List, Optional

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
MODEL_PATH = os.path.join(BASE_DIR, 'model', 'isolation_forest.joblib')

print("Loading model artifacts...")
try:
    model = joblib.load(MODEL_PATH)
    print("Artifacts loaded successfully.")
except Exception as e:
    print(f"Error loading artifacts: {e}")
    model = None

# Pydantic Schema for Input Validation
class EmployeeRecord(BaseModel):
    Employee_ID: str = Field(alias='Employee_ID')
    Name: str
    Department: str
    Bank_Account: str
    Physical_Address: Optional[str] = None
    Tax_Form_Submitted: bool
    Monthly_Salary: float
    Days_Present: float
    Courses_Taught: float

    # Ignore extra fields like 'id' if they are present in the CSV
    model_config = ConfigDict(extra='ignore', populate_by_name=True)

@app.get("/")
def read_root():
    return {"status": "ML Service Running (Isolation Forest)"}

def engineer_features(df):
    """
    Apply the same feature engineering steps as during training.
    """
    df_engineered = df.copy()
    
    # 1. Bank Account Collisions
    account_counts = df_engineered['Bank_Account'].value_counts().to_dict()
    df_engineered['Bank_Account_Collision_Count'] = df_engineered['Bank_Account'].map(account_counts).fillna(1)
    
    # 2. Profile Completeness Percentage
    essential_cols = ['Name', 'Physical_Address', 'Tax_Form_Submitted', 'Bank_Account']
    # If the column exists, check its completeness (pandas counts non-NA)
    missing_count = df_engineered[essential_cols].isnull().sum(axis=1)
    df_engineered['Profile_Completeness_Percentage'] = 100 - (missing_count / len(essential_cols) * 100)
    
    # 3. Department Salary Variance
    # In a real app, you might use historical department averages, but here we use the batch average.
    dept_avg_salary = df_engineered.groupby('Department')['Monthly_Salary'].transform('mean')
    df_engineered['Department_Salary_Variance'] = abs(df_engineered['Monthly_Salary'] - dept_avg_salary) / dept_avg_salary
    
    # Fill NAs in our engineered columns
    df_engineered['Department_Salary_Variance'] = df_engineered['Department_Salary_Variance'].fillna(0)
    df_engineered['Bank_Account_Collision_Count'] = df_engineered['Bank_Account_Collision_Count'].fillna(1)
    df_engineered['Profile_Completeness_Percentage'] = df_engineered['Profile_Completeness_Percentage'].fillna(100)
    
    return df_engineered

def get_anomaly_explanation(row):
    explanations = []
    if row['Days_Present'] == 0 and row['Monthly_Salary'] > 0:
         explanations.append("0 days present but receiving salary.")
    if row['Bank_Account_Collision_Count'] > 1:
         explanations.append(f"Bank account shared with {int(row['Bank_Account_Collision_Count'])-1} others.")
    if row['Profile_Completeness_Percentage'] < 100:
         explanations.append(f"Profile is only {row['Profile_Completeness_Percentage']:.0f}% complete.")
    if row['Department_Salary_Variance'] > 0.5:
          explanations.append("Salary significantly deviates from department average.")
    
    if not explanations:
        return "Anomalous pattern detected by the model across multiple features."
    
    return " Flagged because: " + " ".join(explanations)


@app.post("/analyze")
async def analyze_file(file: UploadFile = File(...)):
    if model is None:
        return {"status": "error", "error": "Model not loaded"}

    # 1. Read the uploaded CSV file
    try:
        contents = await file.read()
        df = pd.read_csv(io.BytesIO(contents))
    except Exception as e:
        return {"status": "error", "error": f"Failed to read CSV: {str(e)}"}
    
    # 2. Pydantic Validation
    records = df.to_dict(orient='records')
    validated_data = []
    errors = []
    
    for i, record in enumerate(records):
        try:
             # Convert pandas NaNs to None for Pydantic to handle Optional fields
             cleaned_record = {k: (None if pd.isna(v) else v) for k, v in record.items()}
             validated = EmployeeRecord(**cleaned_record)
             validated_data.append(validated.model_dump(by_alias=True))
        except Exception as e:
             errors.append(f"Row {i+1} validation failed: {str(e)[:100]}...") # truncate for brevity
             
    if not validated_data:
        return {"status": "error", "error": f"Data validation failed. Expected columns: Employee_ID, Name, Department, Bank_Account, Tax_Form_Submitted, Monthly_Salary, Days_Present, Courses_Taught. Errors: {errors[:3]}"}
    
    # Convert validated data back to Dataframe for processing
    valid_df = pd.DataFrame(validated_data)

    # 3. Preprocess / Engineer Features
    df_engineered = engineer_features(valid_df)

    # Need exact feature order as training
    features = [
        'Monthly_Salary', 'Days_Present', 'Courses_Taught', 
        'Bank_Account_Collision_Count', 'Profile_Completeness_Percentage', 'Department_Salary_Variance'
    ]

    X = df_engineered[features]
    
    # 4. Predict
    # IsolationForest returns -1 for outliers and 1 for inliers.
    # decision_function returns anomaly score (lower means more anomalous)
    predictions = model.predict(X)
    scores = model.decision_function(X) # Can be used to rank anomalies
    
    valid_df['Anomaly'] = predictions
    valid_df['Anomaly_Score'] = -scores # Invert so higher is more anomalous
    
    # 5. Flag Anomalies and create frontend data
    def assign_risk(score):
        # The threshold varies depending on contamination in training. 
        # Typically scores < 0 are anomalies in output (-1). Let's say if predicted -1, it's High/Medium.
        # We inverted the score, so positive is anomalous.
        if score > 0.05: return 'High'
        if score > 0: return 'Medium'
        return 'Low'

    valid_df['Risk_Level'] = valid_df['Anomaly_Score'].apply(assign_risk)
    
    # Map back our engineered features for the explanation generator
    valid_df['Bank_Account_Collision_Count'] = df_engineered['Bank_Account_Collision_Count']
    valid_df['Profile_Completeness_Percentage'] = df_engineered['Profile_Completeness_Percentage']
    valid_df['Department_Salary_Variance'] = df_engineered['Department_Salary_Variance']
    
    valid_df['id'] = valid_df['Employee_ID']
    valid_df['explanation'] = valid_df.apply(lambda row: 
        get_anomaly_explanation(row) if row['Anomaly'] == -1 else "Normal behavior detected.", axis=1)
        
    # Scale score to 0-100% for the frontend progress bar (approximate normalization)
    min_score, max_score = valid_df['Anomaly_Score'].min(), valid_df['Anomaly_Score'].max()
    if max_score > min_score:
         valid_df['Reconstruction_Error'] = (valid_df['Anomaly_Score'] - min_score) / (max_score - min_score)
    else:
         valid_df['Reconstruction_Error'] = 0

    # 6. Filter & Return Results (Convert to JSON)
    valid_df = valid_df.drop(columns=['Anomaly', 'Anomaly_Score', 'Bank_Account_Collision_Count', 'Profile_Completeness_Percentage', 'Department_Salary_Variance'])
    valid_df = valid_df.replace({np.nan: None})
    results = valid_df.to_dict(orient="records")
    
    return {"status": "success", "data": results}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
