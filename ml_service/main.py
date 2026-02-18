from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
import pandas as pd
import numpy as np
import tensorflow as tf
import joblib
import io
import os

app = FastAPI()

# Enable CORS so your React frontend (localhost:5173) can talk to this backend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:5174"], # Allow Vite Frontend
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Load Model & Scaler
MODEL_PATH = 'ml_service/model/ghost_detector_model.h5'
SCALER_PATH = 'ml_service/model/scaler.pkl'

print("Loading model artifacts...")
try:
    # Compile=False to avoid deserialization errors with custom metrics/losses if any
    model = tf.keras.models.load_model(MODEL_PATH, compile=False) 
    scaler = joblib.load(SCALER_PATH)
    print("Artifacts loaded successfully.")
except Exception as e:
    print(f"Error loading artifacts: {e}")
    model = None
    scaler = None

THRESHOLD = 0.5  # Set your anomaly threshold (MSE)

@app.get("/")
def read_root():
    return {"status": "ML Service Running"}

@app.post("/analyze")
async def analyze_file(file: UploadFile = File(...)):
    if model is None or scaler is None:
        return {"status": "error", "error": "Model not loaded"}

    # 1. Read the uploaded CSV file
    try:
        contents = await file.read()
        df = pd.read_csv(io.BytesIO(contents))
    except Exception as e:
        return {"status": "error", "error": f"Failed to read CSV: {str(e)}"}
    
    # Check if required columns exist (case-insensitive check if needed, but strict for now)
    required_cols = ['Monthly_Salary', 'Days_Present', 'Courses_Taught']
    
    # Simple validation using set intersection could be more robust, but loop is fine
    missing_cols = [col for col in required_cols if col not in df.columns]
    if missing_cols:
         return {"status": "error", "error": f"CSV must contain columns: {', '.join(missing_cols)}"}

    # 2. Preprocess Data
    # Force conversion to numeric to handle potential repeated headers or string garbage
    # This modifies the main dataframe 'df' so that we can filter out bad rows
    for col in required_cols:
        df[col] = pd.to_numeric(df[col], errors='coerce')
    
    # Drop rows that couldn't be converted (they will have NaN)
    # This effectively removes repeated header rows if present
    df = df.dropna(subset=required_cols)

    if df.empty:
        return {"status": "error", "error": "No valid numeric data found in file."}

    data_to_scale = df[required_cols]
    
    try:
        X_scaled = scaler.transform(data_to_scale)
    except Exception as e:
        return {"status": "error", "error": f"Scaling failed: {str(e)}"}

    # 3. Predict (Reconstruct)
    reconstructions = model.predict(X_scaled)
    # Mean Squared Error per sample
    mse = np.mean(np.power(X_scaled - reconstructions, 2), axis=1)

    # 4. Flag Anomalies
    df['Reconstruction_Error'] = mse
    df['Risk_Level'] = df['Reconstruction_Error'].apply(
        lambda x: 'High' if x > THRESHOLD else ('Medium' if x > THRESHOLD/2 else 'Low')
    )
    
    # Add an ID column if not present, for frontend keys
    if 'id' not in df.columns and 'Employee_ID' in df.columns:
        df['id'] = df['Employee_ID']
    elif 'id' not in df.columns:
         df['id'] = range(1, len(df) + 1)
         
    # Add explanation for frontend (simple logic for now)
    df['explanation'] = df.apply(lambda row: 
        f"Reconstruction error {row['Reconstruction_Error']:.4f} exceeds threshold." if row['Risk_Level'] == 'High' else 
        (f"Reconstruction error {row['Reconstruction_Error']:.4f} is elevated." if row['Risk_Level'] == 'Medium' else "Normal behavior behavior detected."), axis=1)

    # 5. Filter & Return Results (Convert to JSON)
    # Replace NaN with null for JSON compatibility
    df = df.replace({np.nan: None})
    
    results = df.to_dict(orient="records")
    
    return {"status": "success", "data": results}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
