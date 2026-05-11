import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || '/api';

export const getAuthHeaders = () => {
    const token = localStorage.getItem('token');
    return token ? { Authorization: `Bearer ${token}` } : {};
};

export const api = axios.create({
    baseURL: API_URL,
    headers: {
        'Content-Type': 'application/json',
    },
});

api.interceptors.request.use((config) => {
    const token = localStorage.getItem('token');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

// Fetch employees — returns a plain array for backward compatibility.
// Pass params like { page, limit, department, risk, search } to use the paginated API.
// Returns { employees: [], pagination: null } when paginated, or a plain [] when not.
export const fetchEmployees = async (params = {}) => {
    try {
        const hasPagination = params.page !== undefined || params.limit !== undefined;
        const response = await api.get('/employees', { params });
        if (hasPagination && response.data && Array.isArray(response.data.data)) {
            // Paginated response: { data: [], pagination: {...} }
            return { employees: response.data.data, pagination: response.data.pagination };
        }
        // Plain array — existing callers get a flat array
        return Array.isArray(response.data) ? response.data : (response.data.data || response.data);
    } catch (error) {
        console.error("Error fetching employees:", error);
        return null;
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
        const response = await fetch(`${API_URL}/history/csv${params}`, {
            headers: getAuthHeaders()
        });
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

export const downloadHistoricalDataAsCSV = async (employeeId, fileName = 'history.csv') => {
    try {
        const params = employeeId ? `?employeeId=${encodeURIComponent(employeeId)}` : '';
        const response = await fetch(`${API_URL}/history/csv${params}`, {
            headers: getAuthHeaders()
        });
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        
        const link = document.createElement('a');
        link.href = url;
        link.download = fileName;
        link.setAttribute('target', '_blank');
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    } catch (error) {
        console.error('Error downloading CSV:', error);
        throw error;
    }
};
