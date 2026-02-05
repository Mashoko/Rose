import { createContext, useContext, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';

const AuthContext = createContext();
// ...
// ...
const login = async (username, password) => {
    try {
        const res = await api.post('/auth/login', { username, password });
        const { token, user } = res.data;
        localStorage.setItem('token', token);
        localStorage.setItem('user', JSON.stringify(user));
        setUser(user);
        navigate('/');
        return { success: true };
    } catch (error) {
        console.error("Login failed", error);
        return { success: false, message: error.response?.data?.error || "Login failed" };
    }
};

const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
    navigate('/login');
};

const value = {
    user,
    loading,
    login,
    logout
};

return (
    <AuthContext.Provider value={value}>
        {!loading && children}
    </AuthContext.Provider>
);
};
