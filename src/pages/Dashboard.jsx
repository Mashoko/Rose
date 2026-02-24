import React, { useState, useEffect } from 'react';
import StatusCard from '../components/StatusCard';
import ScatterPlot from '../components/ScatterPlot';
import DetailModal from '../components/DetailModal';
import { fetchEmployees, fetchReports } from '../services/api';
import { Users, AlertTriangle, DollarSign, Activity, List as ListIcon, TrendingUp, Eye } from 'lucide-react';
import { Line } from 'react-chartjs-2';
import { AnimatePresence } from 'framer-motion';
import {
    Chart as ChartJS,
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    Title,
    Tooltip,
    Legend
} from 'chart.js';

ChartJS.register(
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    Title,
    Tooltip,
    Legend
);

const Dashboard = () => {
    // 1. State Management
    const [employees, setEmployees] = useState([]);
    const [reports, setReports] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [viewMode, setViewMode] = useState('scatter'); // 'scatter' or 'list'
    const [selectedEmployee, setSelectedEmployee] = useState(null);
    const [filterDept, setFilterDept] = useState('All');
    const [filterRisk, setFilterRisk] = useState('All');

    // Pagination State
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 10;

    // 2. Fetch Data on Mount
    useEffect(() => {
        const loadDashboardData = async () => {
            setLoading(true);
            try {
                const [empData, reportData] = await Promise.all([
                    fetchEmployees(),
                    fetchReports()
                ]);

                if (empData) setEmployees(empData);
                else setError("Failed to fetch data from the server.");

                if (reportData) setReports(reportData);
            } catch (err) {
                setError("An error occurred while fetching dashboard data.");
            } finally {
                setLoading(false);
            }
        };

        loadDashboardData();

        // Real-time SSE Setup
        const sse = new EventSource('http://localhost:5000/api/stream/reports');

        sse.onmessage = (event) => {
            const data = JSON.parse(event.data);
            if (data.event === 'new_report') {
                console.log("New ML Analysis detected, refreshing dashboard...", data.timestamp);
                setLoading(true); // show spinner briefly
                setTimeout(() => {
                    loadDashboardData();
                }, 1500); // 1.5s delay to allow DB writes to settle
            }
        };

        sse.onerror = (err) => {
            console.error("SSE connection error", err);
            sse.close();
        };

        // Cleanup on unmount
        return () => {
            sse.close();
        };
    }, []);

    // 3. Dynamic Filtering
    const departments = ['All', ...new Set(employees.map(e => e.department).filter(Boolean))];

    const filteredEmployees = employees.filter(emp => {
        if (filterDept !== 'All' && emp.department !== filterDept) return false;

        if (filterRisk !== 'All') {
            const isGhostOrHigh = emp.isGhost === true || emp.riskLevel === 'High' || emp.riskLevel === 'Critical';
            if (filterRisk === 'High Risk' && !isGhostOrHigh) return false;
            if (filterRisk === 'Normal' && isGhostOrHigh) return false;
        }
        return true;
    });

    // 4. Dynamic Calculations (Metrics)
    // Adjust properties to match EmployeeSchema (isGhost, salary, attendanceDays, etc)
    const totalRecords = filteredEmployees.length;
    const anomalies = filteredEmployees.filter(emp => emp.isGhost === true || emp.riskLevel === 'High' || emp.riskLevel === 'Critical');
    const normalEmployees = filteredEmployees.filter(emp => emp.isGhost !== true && emp.riskLevel !== 'High' && emp.riskLevel !== 'Critical');

    const totalLoss = anomalies.reduce((sum, emp) => sum + (Number(emp.salary) || 0), 0);

    // 4. Format Data for Chart.js Scatter Plot
    const scatterData = {
        datasets: [
            {
                label: 'Normal Employees',
                data: normalEmployees.map(emp => ({
                    x: emp.attendanceDays || 0,
                    y: emp.salary || 0,
                    id: emp.id || emp.employeeId,
                    rawEmp: emp
                })),
                backgroundColor: 'rgba(0, 0, 128, 0.6)', // Navy
            },
            {
                label: 'Suspected Ghosts',
                data: anomalies.map(emp => ({
                    x: emp.attendanceDays || 0,
                    y: emp.salary || 0,
                    id: emp.id || emp.employeeId,
                    rawEmp: emp
                })),
                backgroundColor: 'rgba(255, 0, 0, 1)', // Red
                pointRadius: 6,
            },
        ],
    };

    const handlePointClick = (point) => {
        if (point && point.rawEmp) {
            const mappedEmp = {
                ...point.rawEmp,
                // Detail modal expects name, risk, and score mapping
                name: point.rawEmp.fullName,
                risk: point.rawEmp.riskLevel,
                score: point.rawEmp.anomalyScore,
            };
            setSelectedEmployee(mappedEmp);
        }
    };

    const handleListClick = (emp) => {
        const mappedEmp = {
            ...emp,
            name: emp.fullName,
            risk: emp.riskLevel,
            score: emp.anomalyScore,
        };
        setSelectedEmployee(mappedEmp);
    };

    const handleEmployeeUpdate = (id, newStatus) => {
        setEmployees(employees.map(emp => {
            const empId = emp.id || emp.employeeId;
            if (empId === id) {
                return { ...emp, status: newStatus };
            }
            return emp;
        }));

        if (selectedEmployee && (selectedEmployee.id || selectedEmployee.employeeId) === id) {
            setSelectedEmployee({ ...selectedEmployee, status: newStatus });
        }
    };

    // 5. Line Chart Data for Historical Exposure
    const lineData = {
        labels: reports.slice().reverse().map(r => new Date(r.date).toLocaleDateString()),
        datasets: [
            {
                label: 'Total Financial Exposure ($)',
                data: reports.slice().reverse().map(r => r.summary?.totalExposure || 0),
                borderColor: 'rgba(239, 68, 68, 1)', // Red
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                borderWidth: 2,
                fill: true,
                tension: 0.4,
                yAxisID: 'y'
            },
            {
                label: 'Total Anomalies Detected',
                data: reports.slice().reverse().map(r => (r.summary?.highRiskCount || 0) + (r.summary?.mediumRiskCount || 0)),
                borderColor: 'rgba(59, 130, 246, 1)', // Blue
                backgroundColor: 'transparent',
                borderWidth: 2,
                borderDash: [5, 5],
                tension: 0.4,
                yAxisID: 'y1'
            }
        ]
    };

    const lineOptions = {
        responsive: true,
        interaction: { mode: 'index', intersect: false },
        plugins: {
            legend: { position: 'top' }
        },
        scales: {
            y: { type: 'linear', display: true, position: 'left', title: { display: true, text: 'Exposure ($)' } },
            y1: { type: 'linear', display: true, position: 'right', grid: { drawOnChartArea: false }, title: { display: true, text: 'Count' } }
        }
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

                    {/* Filters & View Toggle */}
                    <div className="flex flex-wrap items-center gap-4">
                        <select
                            value={filterDept}
                            onChange={(e) => { setFilterDept(e.target.value); setCurrentPage(1); }}
                            className="text-sm border-gray-300 rounded-lg shadow-sm focus:border-blue-500 focus:ring-blue-500"
                        >
                            {departments.map(d => <option key={d} value={d}>{d}</option>)}
                        </select>

                        <select
                            value={filterRisk}
                            onChange={(e) => { setFilterRisk(e.target.value); setCurrentPage(1); }}
                            className="text-sm border-gray-300 rounded-lg shadow-sm focus:border-blue-500 focus:ring-blue-500"
                        >
                            <option value="All">All Risks</option>
                            <option value="High Risk">High Risk Only</option>
                            <option value="Normal">Normal Only</option>
                        </select>

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
                </div>

                {/* Render Selected View */}
                {viewMode === 'scatter' ? (
                    <div className="fade-in">
                        <ScatterPlot data={scatterData} onPointClick={handlePointClick} />
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
                                    <th className="px-6 py-3 border-b border-gray-200">Case Status</th>
                                    <th className="px-6 py-3 border-b border-gray-200 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredEmployees.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage).map((emp, index) => (
                                    <tr key={index} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                                        <td className="px-6 py-4 font-medium text-gray-900">{emp.id || emp.employeeId}</td>
                                        <td className="px-6 py-4 font-medium text-gray-900">{emp.fullName}</td>
                                        <td className="px-6 py-4 text-gray-600">{emp.department}</td>
                                        <td className="px-6 py-4">${emp.salary}</td>
                                        <td className="px-6 py-4">
                                            {emp.status === 'Confirmed Ghost' && <span className="text-red-800 font-bold bg-red-100 px-2.5 py-1 rounded-full text-xs">Confirmed</span>}
                                            {emp.status === 'Under Investigation' && <span className="text-orange-800 font-bold bg-orange-100 px-2.5 py-1 rounded-full text-xs">Investigating</span>}
                                            {emp.status === 'False Positive' && <span className="text-gray-800 font-bold bg-gray-200 px-2.5 py-1 rounded-full text-xs">Safe</span>}
                                            {(emp.status === 'Pending' || !emp.status) && (
                                                (emp.isGhost === true || emp.riskLevel === 'High' || emp.riskLevel === 'Critical') ?
                                                    (<span className="text-yellow-800 font-bold bg-yellow-100 px-2.5 py-1 rounded-full text-xs">Flagged</span>) :
                                                    (<span className="text-green-800 font-bold bg-green-100 px-2.5 py-1 rounded-full text-xs">Normal</span>)
                                            )}
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <button
                                                onClick={() => handleListClick(emp)}
                                                className="text-primary hover:text-blue-800 font-medium text-sm inline-flex items-center gap-1"
                                            >
                                                <Eye className="w-4 h-4" /> View
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>

                        {/* Pagination Controls */}
                        {filteredEmployees.length > itemsPerPage && (
                            <div className="flex items-center justify-between px-6 py-3 border-t border-gray-200 bg-gray-50">
                                <div className="text-sm text-gray-700">
                                    Showing <span className="font-medium">{((currentPage - 1) * itemsPerPage) + 1}</span> to <span className="font-medium">{Math.min(currentPage * itemsPerPage, filteredEmployees.length)}</span> of <span className="font-medium">{filteredEmployees.length}</span> results
                                </div>
                                <div className="flex bg-white rounded-md shadow-sm border border-gray-300">
                                    <button
                                        onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                                        disabled={currentPage === 1}
                                        className="px-3 py-1 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed border-r border-gray-300"
                                    >
                                        Previous
                                    </button>
                                    <button
                                        onClick={() => setCurrentPage(prev => Math.min(prev + 1, Math.ceil(filteredEmployees.length / itemsPerPage)))}
                                        disabled={currentPage === Math.ceil(filteredEmployees.length / itemsPerPage)}
                                        className="px-3 py-1 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        Next
                                    </button>
                                </div>
                            </div>
                        )}
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

            {/* Historical Trends Section */}
            {reports.length > 0 && (
                <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm mt-8">
                    <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2 mb-6">
                        <TrendingUp className="w-5 h-5 text-red-600" />
                        Historical Exposure Trends
                    </h3>
                    <div className="h-72 w-full">
                        <Line data={lineData} options={lineOptions} />
                    </div>
                </div>
            )}

            <AnimatePresence>
                {selectedEmployee && (
                    <DetailModal
                        employee={selectedEmployee}
                        onClose={() => setSelectedEmployee(null)}
                        onUpdate={handleEmployeeUpdate}
                    />
                )}
            </AnimatePresence>
        </div>
    );
};

export default Dashboard;
