# GEMS - Ghost Employee Management System

## Overview

ML - Ghost Employee Detection  is a full-stack web application designed to detect and flag potential "ghost employees" within an organization's payroll and HR datasets. Utilizing a Machine Learning pipeline powered by a TensorFlow Autoencoder, GEMS analyzes employee data encompassing monthly salaries, attendance records, and other metrics to identify anomalous patterns. The system features a responsive React dashboard for visualizing system status, uploading data for analysis, and generating detailed risk reports to help organizations maintain payroll integrity.

## Features
- **Dashboard**: Visual overview of system status and recent alerts.
- **Analysis & Detection**: Upload payroll/attendance CSVs to detect anomalies using ML.
- **Reports**: Generate and view detailed reports on flagged employees.
- **ML-Powered Detection**: Uses an Isolation Forest algorithm to learn normal employee behavior and flag deviations.

## Technology Stack
- **Frontend**: React (Vite), Tailwind CSS, Lucide React
- **Backend API**: Node.js (Express), MongoDB
- **ML Service**: Python (FastAPI), TensorFlow, Scikit-learn, Pandas

## Prerequisites
- Node.js (v18+)
- Python (v3.10+)
- MongoDB Atlas URI (or local instance)

## Installation

### 1. Clone the Repository
```bash
git clone <repository-url>
cd Rose
```

### 2. Backend Setup (Node.js)
```bash
# Install dependencies
npm install

# Create .env file
echo "MONGO_URI=your_mongodb_connection_string" > .env
echo "PORT=5000" >> .env
```

### 3. Frontend Setup
```bash
# Install dependencies (if not already done via root package.json)
npm install
```

### 4. ML Service Setup (Python)
```bash
# Create virtual environment
python3 -m venv ml_service/venv

# Activate virtual environment
source ml_service/venv/bin/activate  # Windows: ml_service\venv\Scripts\activate

# Install dependencies
pip install -r ml_service/requirements.txt
```

## Running the Project

You need to run three separate terminals for the full system.

**Terminal 1: Backend**
```bash
node server.js
# Runs on http://localhost:5000
```

**Terminal 2: Frontend**
```bash
npm run dev
# Runs on http://localhost:5173
```

**Terminal 3: ML Service**
```bash
source ml_service/venv/bin/activate
python ml_service/main.py
# Runs on http://localhost:8000
```

## Usage

1.  **Open the Frontend**: Go to `http://localhost:5173`.
2.  **Navigate to Analyze**: Click "Analyze" in the sidebar.
3.  **Upload Data**: Upload a CSV file containing `Monthly_Salary`, `Days_Present`, and `Courses_Taught`.
    -   *Note*: The system also supports `Name` or `Employee_Name` and `Department` columns for better reporting.
4.  **View Results**: The system will display a table of employees with their "Risk Level" (Low, Medium, High).

## ML Model Details
The system uses an **Isolation Forest** anomaly detection algorithm.
-   **Training**: Trained on "normal" employee data (e.g., standard salary, high attendance).
-   **Detection**: It calculates an anomaly score for new data. A negative score means the data point (employee) is anomalous (e.g., high salary + zero attendance).
-   **Retraining**: You can retrain the model by running `python ml_service/train_model.py`.
