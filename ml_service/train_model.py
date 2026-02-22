import numpy as np
import pandas as pd
from sklearn.ensemble import IsolationForest
import joblib
import os
import random

# Create directories if they don't exist
os.makedirs('ml_service/model', exist_ok=True)

# 1. Generate Dummy "Normal" Data (for training)
# Simulating 2000 employees who are NOT ghosts (normal behavior)
np.random.seed(42)
random.seed(42)

num_normal = 2000
normal_data = pd.DataFrame({
    'Employee_ID': [f'EMP-{i:04d}' for i in range(1, num_normal + 1)],
    'Name': [f'Employee {i}' for i in range(1, num_normal + 1)],
    'Department': np.random.choice(['IT', 'HR', 'Finance', 'Engineering', 'Marketing', 'Sales'], num_normal),
    'Bank_Account': [f'ACC-{random.randint(10000000, 99999999)}' for _ in range(num_normal)],
    'Physical_Address': [f'{random.randint(1, 999)} Main St, City' for _ in range(num_normal)],
    'Tax_Form_Submitted': np.random.choice([True, False], num_normal, p=[0.95, 0.05]), # 5% missing tax form
    
    'Monthly_Salary': np.random.normal(5000, 1500, num_normal), # Avg $5000
    'Days_Present': np.random.normal(20, 2, num_normal),       # Avg 20 days
    'Courses_Taught': np.random.normal(2, 0.5, num_normal)      # Avg 2 courses
})

# Missing Address logic for normal (small percentage)
missing_address_idx = np.random.choice(num_normal, int(num_normal * 0.02), replace=False)
normal_data.loc[missing_address_idx, 'Physical_Address'] = np.nan

# Ensure reasonable bounds
normal_data['Days_Present'] = normal_data['Days_Present'].clip(0, 31)
normal_data['Monthly_Salary'] = normal_data['Monthly_Salary'].clip(2000, 15000)
normal_data['Courses_Taught'] = normal_data['Courses_Taught'].clip(0, 10).round()

# 2. Feature Engineering function (used for training AND inference)
def engineer_features(df):
    df_engineered = df.copy()
    
    # 1. Bank Account Collisions (How many times this bank account appears in the dataset)
    account_counts = df_engineered['Bank_Account'].value_counts().to_dict()
    df_engineered['Bank_Account_Collision_Count'] = df_engineered['Bank_Account'].map(account_counts).fillna(1)
    
    # 2. Profile Completeness Percentage
    # Checking for missing values in Address, Tax Form, Name, etc.
    essential_cols = ['Name', 'Physical_Address', 'Tax_Form_Submitted', 'Bank_Account']
    # If the column exists, check its completeness
    missing_count = df_engineered[essential_cols].isnull().sum(axis=1)
    df_engineered['Profile_Completeness_Percentage'] = 100 - (missing_count / len(essential_cols) * 100)
    
    # 3. Department Salary Variance
    # Calculate avg salary per department
    dept_avg_salary = df_engineered.groupby('Department')['Monthly_Salary'].transform('mean')
    # Deviation from mean (percentage)
    df_engineered['Department_Salary_Variance'] = abs(df_engineered['Monthly_Salary'] - dept_avg_salary) / dept_avg_salary
    
    # Fill any NaN created during mapping/groupby on our engineered features specifically
    df_engineered['Department_Salary_Variance'] = df_engineered['Department_Salary_Variance'].fillna(0)
    df_engineered['Bank_Account_Collision_Count'] = df_engineered['Bank_Account_Collision_Count'].fillna(1)
    df_engineered['Profile_Completeness_Percentage'] = df_engineered['Profile_Completeness_Percentage'].fillna(100)
    
    return df_engineered

# Engineer features on existing data
normal_data_engineered = engineer_features(normal_data)

# Extract only the numeric features used for the model
features = [
    'Monthly_Salary', 'Days_Present', 'Courses_Taught', 
    'Bank_Account_Collision_Count', 'Profile_Completeness_Percentage', 'Department_Salary_Variance'
]

X_train = normal_data_engineered[features]

# 3. Build & Train Isolation Forest
print("Training Isolation Forest...")
# Contamination is an estimate of the proportion of outliers in the training data.
# We set it low because our training set is mostly 'normal'.
iso_forest = IsolationForest(n_estimators=100, contamination=0.01, random_state=42)
iso_forest.fit(X_train)

# 4. Save Model 
joblib.dump(iso_forest, 'ml_service/model/isolation_forest.joblib')
print("✅ Isolation Forest model saved to ml_service/model/isolation_forest.joblib!")

# ---------------------------------------------------------
# 5. Generate a Test Dataset containing explicitly injected "Ghosts"
print("Generating explicit test dataset with injected Ghost Employees...")

# Create 5 Ghost Employees
ghost_data = pd.DataFrame({
    'Employee_ID': [f'GHOST-{i}' for i in range(1, 6)],
    'Name': [f'Phantom Employee {i}' for i in range(1, 6)],
    'Department': ['IT', 'HR', 'Finance', 'Engineering', 'Marketing'],
    # Using the exact same bank account for multiple ghosts (Collision!)
    'Bank_Account': ['ACC-99999999', 'ACC-99999999', 'ACC-88888888', 'ACC-88888888', 'ACC-88888888'],
    'Physical_Address': [np.nan, np.nan, 'Unknown', np.nan, np.nan], # Missing info
    'Tax_Form_Submitted': [False, False, False, False, False],
    
    'Monthly_Salary': [12000, 14000, 11500, 13000, 12500], # High salary
    'Days_Present': [0, 0, 1, 0, 0], # Never shows up
    'Courses_Taught': [0, 0, 0, 0, 0]
})

# Combine some normal data with ghosts for a test file
test_data = pd.concat([normal_data.sample(45, random_state=42), ghost_data])
# Shuffle rows
test_data = test_data.sample(frac=1, random_state=42).reset_index(drop=True)

test_data.to_csv('test_employees.csv', index=False)
print("✅ Saved 'test_employees.csv' with normal and injected ghost records for testing!")
