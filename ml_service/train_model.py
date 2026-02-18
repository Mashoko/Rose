import numpy as np
import pandas as pd
import tensorflow as tf
from tensorflow.keras.models import Model
from tensorflow.keras.layers import Input, Dense
from sklearn.preprocessing import StandardScaler
import joblib
import os

# Create directories if they don't exist
os.makedirs('ml_service/model', exist_ok=True)

# 1. Generate Dummy "Normal" Data (for training)
# Simulating 1000 employees who are NOT ghosts (normal behavior)
# Features: [Monthly_Salary, Days_Present, Courses_Taught]
np.random.seed(42)
normal_data = pd.DataFrame({
    'Monthly_Salary': np.random.normal(3000, 500, 1000), # Avg $3000
    'Days_Present': np.random.normal(20, 2, 1000),       # Avg 20 days
    'Courses_Taught': np.random.normal(4, 1, 1000)       # Avg 4 courses
})

# Ensure reasonable bounds
normal_data['Days_Present'] = normal_data['Days_Present'].clip(0, 31)
normal_data['Monthly_Salary'] = normal_data['Monthly_Salary'].clip(1000, 10000)
normal_data['Courses_Taught'] = normal_data['Courses_Taught'].clip(0, 10)

# 2. Preprocess
scaler = StandardScaler()
X_train = scaler.fit_transform(normal_data)

# Save scaler immediately
joblib.dump(scaler, 'ml_service/model/scaler.pkl')

# 3. Build Autoencoder
input_dim = X_train.shape[1]
input_layer = Input(shape=(input_dim,))
encoder = Dense(8, activation="relu")(input_layer)
decoder = Dense(input_dim, activation="linear")(encoder) # Reconstruct input

autoencoder = Model(inputs=input_layer, outputs=decoder)
autoencoder.compile(optimizer='adam', loss='mse')

# 4. Train
print("Training Autoencoder...")
autoencoder.fit(X_train, X_train, epochs=50, batch_size=32, shuffle=True, verbose=0)

# 5. Save Artifacts
autoencoder.save('ml_service/model/ghost_detector_model.h5')
print("✅ Model and Scaler saved successfully to ml_service/model/!")
