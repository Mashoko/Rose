import React, { useState, useEffect } from 'react';
import StatusCard from '../components/StatusCard';
import ScatterPlot from '../components/ScatterPlot';
import { fetchEmployees } from '../services/api';
import { Users, AlertTriangle, DollarSign, Activity, List as ListIcon } from 'lucide-react';

const Dashboard = () => {
    // 1. State Management
    const [employees, setEmployees] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [viewMode, setViewMode] = useState('scatter'); // 'scatter' or 'list'

    // 2. Fetch Data on Mount
    useEffect(() => {
        const loadDashboardData = async () => {
            setLoading(true);
            try {
                const data = await fetchEmployees();
                if (data) {
                    setEmployees(data);
                } else {
                    setError("Failed to fetch data from the server.");
                }
            } catch (err) {
                setError("An error occurred while fetching dashboard data.");
            } finally {
                setLoading(false);
            }
        };

        loadDashboardData();
    }, []);

    // 3. Dynamic Calculations (Metrics)
    // Adjust properties to match EmployeeSchema (isGhost, salary, attendanceDays, etc)
    const totalRecords = employees.length;
    const anomalies = employees.filter(emp => emp.isGhost === true || emp.riskLevel === 'High' || emp.riskLevel === 'Critical');
    const normalEmployees = employees.filter(emp => emp.isGhost !== true && emp.riskLevel !== 'High' && emp.riskLevel !== 'Critical');

    const totalLoss = anomalies.reduce((sum, emp) => sum + (Number(emp.salary) || 0), 0);

    // 4. Format Data for Chart.js Scatter Plot
    const scatterData = {
        datasets: [
            {
                label: 'Normal Employees',
                data: normalEmployees.map(emp => ({
                    x: emp.attendanceDays || 0,
                    y: emp.salary || 0,
                    id: emp.id || emp.employeeId
                })),
                backgroundColor: 'rgba(0, 0, 128, 0.6)', // Navy
            },
            {
                label: 'Suspected Ghosts',
                data: anomalies.map(emp => ({
                    x: emp.attendanceDays || 0,
                    y: emp.salary || 0,
                    id: emp.id || emp.employeeId
                })),
                backgroundColor: 'rgba(255, 0, 0, 1)', // Red
                pointRadius: 6,
            },
        ],
    };

    // 5. Conditional Rendering for Loading/Error states
    if (loading) return <div className="p-8 text-center text-gray-500 animate-pulse">Loading payroll data and running ML predictions...</div>;
    if (error) return <div className="p-8 text-center text-red-500">{error}</div>;

    return (
        <div className="space-y-8">
            {/* Header Section */}
            <div>
                <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
                <p className="text-gray-500">Live payroll health overview and anomaly detection.</p>
            </div>

            {/* Status Cards (Now Dynamic) */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <StatusCard
                    title="Total Records Processed"
                    value={totalRecords.toLocaleString()}
                    subtext="Analyzed by ML model"
                    icon={Users}
                    type="neutral"
                />
                <StatusCard
                    title="Suspicious Records"
                    value={anomalies.length}
                    subtext={anomalies.length > 0 ? "Needs immediate review" : "All clear"}
                    icon={AlertTriangle}
                    type={anomalies.length > 0 ? "danger" : "neutral"}
                />
                <StatusCard
                    title="Est. Financial Exposure"
                    value={`$${totalLoss.toLocaleString()}`}
                    subtext="Potential monthly loss"
                    icon={DollarSign}
                    type={totalLoss > 0 ? "danger" : "neutral"}
                />
            </div>

            {/* Visualizations & Data Toggle */}
            <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
                <div className="flex items-center justify-between mb-6">
                    <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                        <Activity className="w-5 h-5 text-blue-800" />
                        Payroll Anomaly Detection
                    </h3>

                    {/* View Toggle Logic */}
                    <div className="flex bg-gray-100 p-1 rounded-lg text-xs">
                        <button
                            onClick={() => setViewMode('scatter')}
                            className={`px-3 py-1 rounded-md font-medium transition-colors ${viewMode === 'scatter' ? 'bg-white shadow-sm text-gray-800' : 'text-gray-500 hover:text-gray-800'}`}>
                            Scatter
                        </button>
                        <button
                            onClick={() => setViewMode('list')}
                            className={`px-3 py-1 rounded-md font-medium transition-colors ${viewMode === 'list' ? 'bg-white shadow-sm text-gray-800' : 'text-gray-500 hover:text-gray-800'}`}>
                            List
                        </button>
                    </div>
                </div>

                {/* Render Selected View */}
                {viewMode === 'scatter' ? (
                    <div className="fade-in">
                        <ScatterPlot data={scatterData} />
                    </div>
                ) : (
                    <div className="fade-in overflow-x-auto">
                        {/* Basic Data Table Placeholder for 'List' View */}
                        <table className="min-w-full text-left text-sm whitespace-nowrap">
                            <thead className="uppercase tracking-wider border-b-2 border-gray-200 bg-gray-50">
                                <tr>
                                    <th className="px-6 py-3 border-b border-gray-200">ID</th>
                                    <th className="px-6 py-3 border-b border-gray-200">Full Name</th>
                                    <th className="px-6 py-3 border-b border-gray-200">Department</th>
                                    <th className="px-6 py-3 border-b border-gray-200">Salary</th>
                                    <th className="px-6 py-3 border-b border-gray-200">Attendance (Days)</th>
                                    <th className="px-6 py-3 border-b border-gray-200">Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {employees.map((emp, index) => (
                                    <tr key={index} className="border-b border-gray-100 hover:bg-gray-50">
                                        <td className="px-6 py-4 font-medium text-gray-900">{emp.id || emp.employeeId}</td>
                                        <td className="px-6 py-4 font-medium text-gray-900">{emp.fullName}</td>
                                        <td className="px-6 py-4 text-gray-600">{emp.department}</td>
                                        <td className="px-6 py-4">${emp.salary}</td>
                                        <td className="px-6 py-4">{emp.attendanceDays}</td>
                                        <td className="px-6 py-4">
                                            {(emp.isGhost === true || emp.riskLevel === 'High' || emp.riskLevel === 'Critical') ? (
                                                <span className="text-red-800 font-bold bg-red-100 px-2.5 py-1 rounded-full text-xs">Ghost</span>
                                            ) : (
                                                <span className="text-green-800 font-bold bg-green-100 px-2.5 py-1 rounded-full text-xs">Normal</span>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                {/* Dynamic Insight Box */}
                <div className="mt-4 p-4 bg-blue-50 rounded-lg text-sm text-blue-800 flex items-start gap-2">
                    <span className="font-bold">Insight:</span>
                    <p>
                        {anomalies.length > 0
                            ? `The model has flagged ${anomalies.length} high-probability Ghost Employee(s). These records represent a potential $${totalLoss.toLocaleString()} exposure.`
                            : `The model has analyzed ${totalRecords} records and currently detects no high-probability anomalies.`}
                    </p>
                </div>
            </div>
        </div>
    );
};

export default Dashboard;
