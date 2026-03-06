import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import StatusCard from '../components/StatusCard';
import DetailModal from '../components/DetailModal';
import { fetchEmployees, fetchReports } from '../services/api';
import { Users, AlertTriangle, DollarSign, Activity, List as ListIcon, TrendingUp, Eye } from 'lucide-react';
import { Line, Bar, Pie } from 'react-chartjs-2';
import { AnimatePresence } from 'framer-motion';
import {
    Chart as ChartJS,
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    BarElement,
    ArcElement,
    Title,
    Tooltip,
    Legend
} from 'chart.js';

ChartJS.register(
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    BarElement,
    ArcElement,
    Title,
    Tooltip,
    Legend
);

const Dashboard = () => {
    // 1. State Management
    const navigate = useNavigate();
    const tableRef = useRef(null);
    const [employees, setEmployees] = useState([]);
    const [reports, setReports] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [viewMode, setViewMode] = useState('scatter'); // 'scatter' or 'list'
    const [selectedEmployee, setSelectedEmployee] = useState(null);
    const [filterDept, setFilterDept] = useState('All');
    const [filterRisk, setFilterRisk] = useState('All');

    // no global historical records state needed on dashboard

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

                // historical records are no longer fetched globally; will be requested per employee when
                // the audit card/modal is opened.  (You can remove the state defined above if unused.)
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
    const totalRecords = employees.length; // Total analyzed by ML model (unfiltered)
    const confirmedGhosts = employees.filter(emp => emp.status === 'Confirmed Ghost').length;
    const anomalies = filteredEmployees.filter(emp => emp.isGhost === true || emp.riskLevel === 'High' || emp.riskLevel === 'Critical');
    const normalEmployees = filteredEmployees.filter(emp => emp.isGhost !== true && emp.riskLevel !== 'High' && emp.riskLevel !== 'Critical');

    const totalLoss = anomalies.reduce((sum, emp) => sum + (Number(emp.salary) || 0), 0);

    // extra metrics for a more comprehensive dashboard
    const totalReports = reports.length;
    const avgSalary = employees.length
        ? employees.reduce((sum, e) => sum + (Number(e.salary) || 0), 0) / employees.length
        : 0;
    const departmentCount = new Set(employees.map(e => e.department).filter(Boolean)).size;

    // 4. Format Data for Chart.js Scatter Plot

    // risk breakdown for bar chart
    const riskCounts = { Low: 0, Medium: 0, High: 0, Critical: 0 };
    employees.forEach(emp => {
        if (riskCounts[emp.riskLevel] !== undefined) {
            riskCounts[emp.riskLevel] += 1;
        }
    });
    const riskChartData = {
        labels: Object.keys(riskCounts),
        datasets: [
            {
                label: 'Employees',
                data: Object.values(riskCounts),
                backgroundColor: [
                    'rgba(34, 197, 94, 0.6)', // green low
                    'rgba(234, 179, 8, 0.6)', // yellow medium
                    'rgba(239, 68, 68, 0.6)', // red high
                    'rgba(126, 34, 206, 0.6)' // purple critical
                ],
                borderColor: [
                    'rgba(34, 197, 94, 1)',
                    'rgba(234, 179, 8, 1)',
                    'rgba(239, 68, 68, 1)',
                    'rgba(126, 34, 206, 1)'
                ],
                borderWidth: 1
            }
        ]
    };
    const riskChartOptions = {
        responsive: true,
        plugins: { legend: { position: 'top' }, title: { display: true, text: 'Risk Level Distribution' } }
    };
    
    // Pie chart data showing risk level distribution
    const pieData = {
        labels: ['Low Risk', 'Medium Risk', 'High Risk', 'Critical Risk'],
        datasets: [
            {
                label: 'Employee Count',
                data: [
                    riskCounts.Low || 0,
                    riskCounts.Medium || 0,
                    riskCounts.High || 0,
                    riskCounts.Critical || 0
                ],
                backgroundColor: [
                    'rgba(34, 197, 94, 0.7)',  // Green for Low
                    'rgba(234, 179, 8, 0.7)',  // Yellow for Medium
                    'rgba(239, 68, 68, 0.7)',  // Red for High
                    'rgba(126, 34, 206, 0.7)'  // Purple for Critical
                ],
                borderColor: [
                    'rgba(34, 197, 94, 1)',
                    'rgba(234, 179, 8, 1)',
                    'rgba(239, 68, 68, 1)',
                    'rgba(126, 34, 206, 1)'
                ],
                borderWidth: 2
            }
        ]
    };
    
    const pieOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                position: 'right',
                labels: {
                    padding: 15,
                    font: { size: 12 }
                }
            },
            title: {
                display: true,
                text: 'Risk Level Distribution',
                font: { size: 16, weight: 'bold' }
            },
            tooltip: {
                callbacks: {
                    label: function(context) {
                        const label = context.label || '';
                        const value = context.parsed || 0;
                        const total = context.dataset.data.reduce((a, b) => a + b, 0);
                        const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : 0;
                        return `${label}: ${value} employees (${percentage}%)`;
                    }
                }
            }
        }
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
            
            // Add determination for ALL employees based on risk level
            const riskMap = {
                'Low': 'NORMAL EMPLOYEE',
                'Medium': 'MEDIUM RISK ALERT',
                'High': 'HIGH RISK ANOMALY',
                'Critical': 'CRITICAL RISK - GHOST EMPLOYEE'
            };
            
            mappedEmp.determination = {
                classification: riskMap[point.rawEmp.riskLevel] || 'UNCLASSIFIED',
                confidence: point.rawEmp.anomalyScore || 0,
                reasoning: [
                    `Risk Level: ${point.rawEmp.riskLevel || 'Unknown'}`,
                    point.rawEmp.attendanceDays !== undefined ? `Attendance: ${Math.round(point.rawEmp.attendanceDays)} days` : null,
                    point.rawEmp.salary ? `Salary: $${Math.round(point.rawEmp.salary).toLocaleString()}` : null,
                    point.rawEmp.biometricLogs !== undefined ? `Biometric Logs: ${point.rawEmp.biometricLogs}` : null,
                    point.rawEmp.isGhost ? 'Status: Flagged as potential ghost employee' : null
                ].filter(Boolean)
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
        
        // Add determination for ALL employees based on risk level
        const riskMap = {
            'Low': 'NORMAL EMPLOYEE',
            'Medium': 'MEDIUM RISK ALERT',
            'High': 'HIGH RISK ANOMALY',
            'Critical': 'CRITICAL RISK - GHOST EMPLOYEE'
        };
        
        mappedEmp.determination = {
            classification: riskMap[emp.riskLevel] || 'UNCLASSIFIED',
            confidence: emp.anomalyScore || 0,
            reasoning: [
                `Risk Level: ${emp.riskLevel || 'Unknown'}`,
                emp.attendanceDays !== undefined ? `Attendance: ${Math.round(emp.attendanceDays)} days` : null,
                emp.salary ? `Salary: $${Math.round(emp.salary).toLocaleString()}` : null,
                emp.biometricLogs !== undefined ? `Biometric Logs: ${emp.biometricLogs}` : null,
                emp.isGhost ? 'Status: Flagged as potential ghost employee' : null
            ].filter(Boolean)
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
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                <StatusCard
                    title="Total Reports"
                    value={totalReports}
                    subtext="Analysis batches stored"
                    icon={ListIcon}
                    type="neutral"
                    onClick={() => navigate('/reports')}
                />
            </div>

            {/* Visualizations & Data Toggle */}
            <div ref={tableRef} className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
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
                                Chart
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
                        <div className="h-96 flex items-center justify-center">
                            <Pie data={pieData} options={pieOptions} />
                        </div>
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

                {/* Risk Distribution Chart */}
                <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm mt-6">
                    <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2 mb-4">
                        <AlertTriangle className="w-5 h-5 text-red-600" />
                        Risk Level Breakdown
                    </h3>
                    <div className="h-64 w-full">
                        <Bar data={riskChartData} options={riskChartOptions} />
                    </div>
                </div>

                <div className="mt-4 p-4 bg-blue-50 rounded-lg text-sm text-blue-800 flex items-start gap-2">
                    <span className="font-bold">Insight:</span>
                    <p>
                        {anomalies.length > 0
                            ? `The model has flagged ${anomalies.length} high-probability Ghost Employee(s). These records represent a potential $${totalLoss.toLocaleString()} exposure.`
                            : `The model has analyzed ${totalRecords} records and currently detects no high-probability anomalies.`}
                    {employees.length > 0 && (
                        <span className="block mt-1 text-xs text-gray-600">
                            Avg. salary: ${avgSalary.toLocaleString(undefined,{style:'currency',currency:'USD',minimumFractionDigits:0})}, Departments: {departmentCount}
                        </span>
                    )}
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
