# CSV Export Implementation Guide

## Overview
The "View CSV" and "Download CSV" buttons in the Audit Card modal are now fully connected to the backend with complete request/response handling.

## Changes Made

### 1. Frontend API Service (`src/services/api.js`)
Added three new functions for CSV operations:

- **`fetchHistoricalDataAsCSV(employeeId)`**: Fetches CSV data and returns it as text
  - Makes a GET request to `/api/history/csv?employeeId={id}`
  - Returns the raw CSV text for display in the modal
  - Includes error handling

- **`downloadHistoricalDataAsCSV(employeeId, fileName)`**: Triggers a browser download
  - Creates a temporary link element
  - Downloads the CSV file with a timestamped filename
  - Properly cleans up DOM after download

### 2. DetailModal Component (`src/components/DetailModal.jsx`)
Updated the modal with improved CSV handling:

- **New state variable**: `csvError` for displaying error messages
- **Updated `handleViewCsv()`**: 
  - Uses new API method
  - Clears previous errors
  - Shows error message in red box if CSV fails to load
  - Displays CSV content in a textarea when successful
  - Shows "No data" message when CSV is empty

- **Updated `downloadCsv()`**:
  - Uses new API method
  - Better error handling with user-friendly messages
  - Loading state prevents multiple clicks during download

- **UI Improvements**:
  - Error messages display in a styled red box
  - CSV preview shows in a readable textarea
  - Better visual feedback during loading

### 3. Backend CSV Endpoint (`server.js`)
Enhanced the `/api/history/csv` endpoint:

**Improvements**:
- ✅ Proper CSV formatting with escaped commas and quotes
- ✅ Better headers: `Content-Type: text/csv; charset=utf-8`
- ✅ Proper file download: `Content-Disposition: attachment`
- ✅ Timestamped filenames for clarity
- ✅ Formatted numbers (Risk Score to 2 decimals)
- ✅ Better error handling with meaningful error messages
- ✅ Filter support via `employeeId` query parameter

**Response Format**:
```csv
Month,Attendance,Risk Score,Status
Aug 2024,0,0.98,Flagged
Sep 2024,0,0.99,Escalated
Oct 2024,0,0.99,Escalated
Nov 2024,0,0.99,Confirmed Ghost
```

## API Endpoints

### GET /api/history/csv
Generates and returns CSV data for historical employee records.

**Query Parameters**:
- `employeeId` (optional): Filter by specific employee ID

**Request Examples**:
```bash
# Get CSV for all employees
GET /api/history/csv

# Get CSV for specific employee
GET /api/history/csv?employeeId=HIT002
```

**Response**:
- Content-Type: `text/csv; charset=utf-8`
- Content-Disposition: `attachment; filename="history_[employeeId]_[timestamp].csv"`
- Body: CSV formatted data

**Success Response** (200 OK):
```csv
Month,Attendance,Risk Score,Status
Aug 2024,0,0.98,Flagged
...
```

**Error Response** (500):
```json
{
  "error": "Failed to generate CSV",
  "message": "[error details]"
}
```

## How to Use

### For End Users:

1. **View CSV in Modal**:
   - Click "View CSV" button
   - CSV data displays in the textarea below
   - Shows loading state while fetching

2. **Download CSV**:
   - Click "Download CSV" button
   - File downloads automatically with employee ID and date in filename
   - Example: `HIT002_history_2024-03-03.csv`

### For Developers:

**Testing the endpoint**:
```bash
# Test health first
curl http://localhost:5000/api/health

# Fetch CSV for employee
curl http://localhost:5000/api/history/csv?employeeId=HIT002

# View response headers
curl -i http://localhost:5000/api/history/csv?employeeId=HIT002
```

## Running the Application

**Start Backend Server**:
```bash
cd Rose
node server.js
# Server runs on port 5000
```

**Start Frontend Development Server** (in another terminal):
```bash
cd Rose
npm run dev
# Frontend runs on port 5175 (or next available)
```

## Features Implemented

✅ Complete POST/GET request cycle  
✅ Frontend API service layer  
✅ Error handling and user feedback  
✅ CSV formatting with proper escaping  
✅ File download with timestamps  
✅ Loading states and user feedback  
✅ Empty data handling  
✅ Employee filtering by ID  

## Data Architecture

**Historical Data Model**:
```javascript
{
  employeeId: String,      // Links to employee
  month: String,           // "Aug 2024" format
  attendance: Number,      // Days attended
  riskScore: Number,       // 0.00 - 1.00 scale
  status: String,          // Flag status
  timestamps: Date         // Created/Updated
}
```

## Troubleshooting

**Issue**: "Unable to load CSV" message appears
- **Solution**: Verify the backend server is running on port 5000
- **Solution**: Check MongoDB connection status
- **Solution**: Ensure historical data exists for the employee

**Issue**: Download doesn't start
- **Solution**: Check browser console for CORS errors
- **Solution**: Verify Content-Disposition header is being sent
- **Solution**: Check if browser has file download permissions

**Issue**: CSV displays but formatting looks wrong
- **Solution**: Verify MongoDB data has proper `month` and `status` values
- **Solution**: Check if special characters in data need escaping

## Future Enhancements

- [ ] Add export to Excel format
- [ ] Add date range filtering
- [ ] Add custom column selection
- [ ] Add email export functionality
- [ ] Add scheduling for automated exports
- [ ] Add export history/audit trail
