import numpy as np
import pandas as pd
from sklearn.ensemble import IsolationForest
import joblib
import os

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

def engineer_features(df_in):
    df_engineered = df_in.copy()
    
    df_engineered['email_filled'] = df_engineered['email'].copy()
    mask_email = df_engineered['email_filled'].isna()
    df_engineered.loc[mask_email, 'email_filled'] = 'unknown_email_' + df_engineered.index[mask_email].astype(str)
    
    df_engineered['phone_filled'] = df_engineered['phone_number'].copy()
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
    
    return df_engineered

def train_and_save_model(additional_data_df=None):
    os.makedirs(os.path.join(BASE_DIR, 'model'), exist_ok=True)
    
    print("Loading baseline datasets...")
    try:
        df1 = pd.read_csv('/home/user/Documents/Calling/Rose/test_data.csv')
        df2 = pd.read_csv('/home/user/Documents/Calling/Rose/test_data2.csv')
        
        # Standardize column names
        df1 = df1.rename(columns={'date_of_hiring': 'hire_date', 'job_title': 'job_titles'})
        
        common_cols = ['employee_id', 'name', 'department', 'email', 'phone_number', 'salary']
        df = pd.concat([df1[common_cols], df2[common_cols]], ignore_index=True)
        
        if additional_data_df is not None:
             print("Appending additional retraining data...")
             # Standardize if needed and keep common cols
             if 'date_of_hiring' in additional_data_df.columns:
                 additional_data_df = additional_data_df.rename(columns={'date_of_hiring': 'hire_date'})
             df = pd.concat([df, additional_data_df[common_cols]], ignore_index=True)
             
    except Exception as e:
        print(f"Error loading data: {e}")
        return False
        
    print("Engineering features...")
    train_data_engineered = engineer_features(df)
    
    features = [
        'salary', 'Email_Collision_Count', 'Phone_Collision_Count',
        'Department_Salary_Variance', 'Profile_Completeness_Percentage'
    ]
    
    X_train = train_data_engineered[features]
    
    print(f"Training Isolation Forest on {len(X_train)} records...")
    iso_forest = IsolationForest(n_estimators=100, contamination=0.05, random_state=42)
    iso_forest.fit(X_train)
    
    MODEL_PATH = os.path.join(BASE_DIR, 'model', 'isolation_forest_model.pkl')
    joblib.dump(iso_forest, MODEL_PATH)
    
    print(f"✅ Isolation Forest model saved to {MODEL_PATH}!")
    return True

if __name__ == '__main__':
    train_and_save_model()
