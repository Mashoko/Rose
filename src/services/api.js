import axios from 'axios';

const API_URL = 'http://localhost:5000/api';

export const api = axios.create({
    baseURL: API_URL,
    headers: {
        'Content-Type': 'application/json',
    },
});

export const fetchEmployees = async () => {
    try {
        const response = await api.get('/employees');
        return response.data;
    } catch (error) {
        console.error("Error fetching employees:", error);
        return null; // Return null to indicate failure (trigger fallback mock data)
    }
};

export const fetchReports = async () => {
    try {
        const response = await api.get('/reports');
        return response.data;
    } catch (error) {
        console.error("Error fetching reports:", error);
        return [];
    }
};

export const fetchDatasetInfo = async () => {
    try {
        const response = await api.get('/dataset-info');
        return response.data;
    } catch (error) {
        console.error("Error fetching dataset info:", error);
        return [];
    }
};

export const updateEmployeeStatus = async (id, status) => {
    try {
        const response = await api.patch(`/employees/${id}/status`, { status });
        return response.data;
    } catch (error) {
        console.error(`Error updating status for employee ${id}:`, error);
        throw error;
    }
};

export const fetchHistoricalData = async (employeeId) => {
    try {
        const response = await api.get('/history', {
            params: { employeeId }
        });
        return response.data;
    } catch (error) {
        console.error('Error fetching historical data:', error);
        throw error;
    }
};

export const fetchHistoricalDataAsCSV = async (employeeId) => {
    try {
        const params = employeeId ? `?employeeId=${encodeURIComponent(employeeId)}` : '';
        const response = await fetch(`${API_URL}/history/csv${params}`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const csvText = await response.text();
        return csvText;
    } catch (error) {
        console.error('Error fetching CSV data:', error);
        throw error;
    }
};

export const downloadHistoricalDataAsCSV = (employeeId, fileName = 'history.csv') => {
    try {
        const params = employeeId ? `?employeeId=${encodeURIComponent(employeeId)}` : '';
        const url = `${API_URL}/history/csv${params}`;
        
        const link = document.createElement('a');
        link.href = url;
        link.download = fileName;
        link.setAttribute('target', '_blank');
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    } catch (error) {
        console.error('Error downloading CSV:', error);
        throw error;
    }
};
