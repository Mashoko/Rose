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
