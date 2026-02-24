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

export const updateEmployeeStatus = async (id, status) => {
    try {
        const response = await api.patch(`/employees/${id}/status`, { status });
        return response.data;
    } catch (error) {
        console.error(`Error updating status for employee ${id}:`, error);
        throw error;
    }
};
