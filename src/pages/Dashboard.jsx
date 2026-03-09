import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import StatusCard from '../components/StatusCard';
import DetailModal from '../components/DetailModal';
import { fetchEmployees, fetchReports } from '../services/api';
import { Users, AlertTriangle, DollarSign, Activity, List as ListIcon, TrendingUp, Eye, Gauge, ShieldCheck, Banknote } from 'lucide-react';
import { Line, Bar, Pie, Doughnut, Scatter } from 'react-chartjs-2';
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

    // In the new model, high-risk employees are automatically treated as ghost employees.
    const highRiskEmployeesAll = employees.filter(
        emp => emp.isGhost === true || emp.riskLevel === 'High' || emp.riskLevel === 'Critical'
    );

    const confirmedGhosts = highRiskEmployeesAll.length;

    // Apply current filters when showing anomalies in the list/chart views
    const anomalies = filteredEmployees.filter(
        emp => emp.isGhost === true || emp.riskLevel === 'High' || emp.riskLevel === 'Critical'
    );
    const normalEmployees = filteredEmployees.filter(
        emp => emp.isGhost !== true && emp.riskLevel !== 'High' && emp.riskLevel !== 'Critical'
    );

    // Exposure is based on all high‑risk employees, not just the filtered subset
    const totalLoss = highRiskEmployeesAll.reduce((sum, emp) => sum + (Number(emp.salary) || 0), 0);

    // Estimated savings from audits (confirmed ghosts removed from payroll).
    // With the new automatic model, this will typically remain 0 until you add a workflow
    // that actually removes or suspends ghost employees from active payroll.
    const savingsFromAudits = employees
        .filter(emp => emp.status === 'Confirmed Ghost')
        .reduce((sum, emp) => sum + (Number(emp.salary) || 0), 0);

    // Executive view health score (very simple heuristic based on anomaly rate)
    const anomalyRate = totalRecords ? (highRiskEmployeesAll.length / totalRecords) : 0;
    const integrityScore = Math.max(0, Math.round(100 - anomalyRate * 100));

    // extra metrics for a more comprehensive dashboard
    const totalReports = reports.length;
    const avgSalary = employees.length
        ? employees.reduce((sum, e) => sum + (Number(e.salary) || 0), 0) / employees.length
        : 0;
    const departmentCount = new Set(employees.map(e => e.department).filter(Boolean)).size;

    // Departmental aggregation for managerial view
    const departmentStats = employees.reduce((acc, emp) => {
        const dept = emp.department || 'Unassigned';
        if (!acc[dept]) {
            acc[dept] = {
                payrollTotal: 0,
                employeeCount: 0,
                highRiskCount: 0,
                anomalyExposure: 0,
            };
        }
        acc[dept].payrollTotal += Number(emp.salary) || 0;
        acc[dept].employeeCount += 1;
        const isHighRisk = emp.isGhost === true || emp.riskLevel === 'High' || emp.riskLevel === 'Critical';
        if (isHighRisk) {
            acc[dept].highRiskCount += 1;
            acc[dept].anomalyExposure += Number(emp.salary) || 0;
        }
        return acc;
    }, {});

    const departmentLabels = Object.keys(departmentStats);
    const departmentRiskPercentages = departmentLabels.map(label => {
        const stat = departmentStats[label];
        if (!stat.employeeCount) return 0;
        return +(stat.highRiskCount / stat.employeeCount * 100).toFixed(1);
    });
    const departmentPayrollTotals = departmentLabels.map(label => departmentStats[label].payrollTotal);

    // Zero-deduction employees (heuristic: missing or zero 'deductions' field)
    const zeroDeductionEmployees = employees.filter(emp => {
        const deductions = Number(emp.deductions ?? emp.totalDeductions ?? 0);
        return (Number.isFinite(deductions) && deductions === 0) || (!emp.deductions && !emp.totalDeductions);
    });

    const zeroDeductionChartData = {
        labels: zeroDeductionEmployees.slice(0, 12).map(emp => emp.fullName || (emp.id || emp.employeeId)),
        datasets: [
            {
                label: 'Net Salary (approx)',
                data: zeroDeductionEmployees.slice(0, 12).map(emp => Number(emp.salary) || 0),
                backgroundColor: 'rgba(59, 130, 246, 0.7)',
                borderColor: 'rgba(59, 130, 246, 1)',
                borderWidth: 1,
            },
        ],
    };

    // Bank account collisions – multiple employees sharing same account number
    const bankCollisionMap = employees.reduce((acc, emp) => {
        const account = emp.bankAccount || emp.bankAccountNumber || emp.iban;
        if (!account) return acc;
        if (!acc[account]) acc[account] = [];
        acc[account].push(emp);
        return acc;
    }, {});

    const bankCollisions = Object.entries(bankCollisionMap)
        .filter(([, emps]) => emps.length > 1)
        .map(([account, emps]) => ({
            account,
            count: emps.length,
            names: emps.map(e => e.fullName || (e.id || e.employeeId)).join(', ')
        }))
        .slice(0, 6);

    // Attendance vs biometric correlation (forensic scatter)
    const attendanceScatterPoints = employees
        .filter(emp => emp.attendanceDays !== undefined && emp.biometricLogs !== undefined)
        .map(emp => ({
            x: Number(emp.attendanceDays) || 0,
            y: Number(emp.biometricLogs) || 0,
        }));

    const attendanceScatterData = {
        datasets: [
            {
                label: 'Attendance vs Biometric Logs',
                data: attendanceScatterPoints,
                backgroundColor: 'rgba(34, 197, 94, 0.7)',
            },
        ],
    };

    // Anomaly score vs salary scatter (forensic view)
    const anomalyScatterPoints = employees
        .filter(emp => emp.anomalyScore !== undefined && emp.salary !== undefined)
        .map(emp => ({
            x: Number(emp.salary) || 0,
            y: Number(emp.anomalyScore) || 0,
        }));

    const anomalyScatterData = {
        datasets: [
            {
                label: 'Anomaly Score vs Salary',
                data: anomalyScatterPoints,
                backgroundColor: 'rgba(239, 68, 68, 0.7)',
            },
        ],
    };

    // Executive tier charts
    const integrityGaugeData = {
        labels: ['Secure', 'Risk'],
        datasets: [
            {
                data: [integrityScore, 100 - integrityScore],
                backgroundColor: ['rgba(34,197,94,0.9)', 'rgba(148,163,184,0.3)'],
                borderWidth: 0,
                circumference: 180,
                rotation: -90,
                cutout: '70%',
            },
        ],
    };

    const savingsGaugeData = {
        labels: ['Recovered Exposure', 'Remaining Risk'],
        datasets: [
            {
                data: [savingsFromAudits, Math.max(totalLoss - savingsFromAudits, 0)],
                backgroundColor: ['rgba(59,130,246,0.9)', 'rgba(148,163,184,0.3)'],
                borderWidth: 0,
                circumference: 180,
                rotation: -90,
                cutout: '70%',
            },
        ],
    };

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

    // 5. Line Chart Data for Historical Exposure (last 30 days)
    const now = new Date();
    const THIRTY_DAYS = 1000 * 60 * 60 * 24 * 30;
    const reportsLastMonth = reports
        .map(r => ({
            ...r,
            _date: new Date(r.date || r.createdAt || r.updatedAt || now),
        }))
        .filter(r => !isNaN(r._date.getTime()) && (now.getTime() - r._date.getTime()) <= THIRTY_DAYS)
        .sort((a, b) => a._date - b._date);

    const lineData = {
        labels: reportsLastMonth.map(r => r._date.toLocaleDateString()),
        datasets: [
            {
                label: 'Total Financial Exposure ($)',
                data: reportsLastMonth.map(r => r.summary?.totalExposure || 0),
                borderColor: 'rgba(239, 68, 68, 1)', // Red
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                borderWidth: 2,
                fill: true,
                tension: 0.4,
                yAxisID: 'y'
            },
            {
                label: 'Total Anomalies Detected',
                data: reportsLastMonth.map(r => (r.summary?.highRiskCount || 0) + (r.summary?.mediumRiskCount || 0)),
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
        maintainAspectRatio: false,
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
        <div className="space-y-8 pb-10">
            {/* Header Section + Provenance strip */}
            <div className="fade-in space-y-3">
                <div>
                    <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">Dashboard</h1>
                    <p className="text-gray-600">Live payroll health overview and anomaly detection.</p>
                </div>
                {reportsLastMonth.length > 0 && (
                    <button
                        type="button"
                        onClick={() => navigate('/reports')}
                        className="w-full md:w-auto glass-card px-4 py-3 flex items-center justify-between md:justify-start gap-3 text-xs md:text-sm hover:bg-white/60 transition-all"
                    >
                        <div className="flex flex-col md:flex-row md:items-center md:gap-3 text-left">
                            <span className="font-semibold text-gray-800 flex items-center gap-1">
                                <TrendingUp className="w-4 h-4 text-red-500" />
                                Latest analysis
                            </span>
                            <span className="text-gray-500">
                                {reportsLastMonth[reportsLastMonth.length - 1].reportName || 'Unnamed run'}
                            </span>
                        </div>
                        <span className="text-[0.7rem] md:text-xs text-gray-500 whitespace-nowrap">
                            {reportsLastMonth[reportsLastMonth.length - 1]._date.toLocaleString()}
                        </span>
                    </button>
                )}
            </div>

            {/* Executive Tier – System Health Overview */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <StatusCard
                    title="System Integrity Score"
                    value={`${integrityScore}%`}
                    subtext={`${anomalies.length} of ${totalRecords} employees currently flagged`}
                    icon={ShieldCheck}
                    type="primary"
                    className="glass-card hover:bg-white/50 transition-all"
                />
                <StatusCard
                    title="Confirmed Ghost Accounts"
                    value={confirmedGhosts}
                    subtext="Removed from active payroll"
                    icon={Users}
                    type="danger"
                    className="glass-card hover:bg-white/50 transition-all"
                    onClick={() => setViewMode('list')}
                />
                <StatusCard
                    title="Estimated Exposure"
                    value={`$${totalLoss.toLocaleString()}`}
                    subtext="Potential monthly loss if unaddressed"
                    icon={DollarSign}
                    type="primary"
                    className="glass-card hover:bg-white/50 transition-all cursor-pointer"
                    onClick={() => navigate('/reports')}
                />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="glass-card p-6">
                    <h3 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2 uppercase tracking-wide">
                        <Gauge className="w-4 h-4 text-emerald-500" />
                        Integrity Gauge
                    </h3>
                    <div className="h-48">
                        <Doughnut data={integrityGaugeData} options={{ plugins: { legend: { display: false } }, maintainAspectRatio: false }} />
                    </div>
                    <p className="mt-3 text-xs text-gray-500">
                        Based on the current anomaly rate across all analyzed employees.
                    </p>
                </div>

                <div className="glass-card p-6">
                    <h3 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2 uppercase tracking-wide">
                        <Banknote className="w-4 h-4 text-blue-500" />
                        Savings from Audits
                    </h3>
                    <div className="h-48">
                        <Doughnut data={savingsGaugeData} options={{ plugins: { legend: { display: false } }, maintainAspectRatio: false }} />
                    </div>
                    <p className="mt-3 text-xs text-gray-500">
                        Salaries associated with confirmed ghost accounts are treated as recovered exposure.
                    </p>
                </div>
            </div>

            {/* Forensic Controls – Risk Distribution & Filters */}
            <div ref={tableRef} className="glass-card p-8">
                <div className="flex items-center justify-between mb-8">
                    <h3 className="text-xl font-bold text-gray-800 flex items-center gap-3">
                        <div className="p-2 bg-blue-500/20 rounded-lg">
                            <Activity className="w-5 h-5 text-blue-900" />
                        </div>
                        Payroll Anomaly Detection
                    </h3>

                    {/* Filters & View Toggle */}
                    <div className="flex flex-wrap items-center gap-4">
                        <select
                            value={filterDept}
                            onChange={(e) => { setFilterDept(e.target.value); setCurrentPage(1); }}
                            className="px-3 py-2 bg-white/50 backdrop-blur-sm border border-white/30 rounded-xl text-sm focus:ring-primary focus:outline-none"
                        >
                            {departments.map(d => <option key={d} value={d}>{d}</option>)}
                        </select>

                        <select
                            value={filterRisk}
                            onChange={(e) => { setFilterRisk(e.target.value); setCurrentPage(1); }}
                            className="px-3 py-2 bg-white/50 backdrop-blur-sm border border-white/30 rounded-xl text-sm focus:ring-primary focus:outline-none"
                        >
                            <option value="All">All Risks</option>
                            <option value="High Risk">High Risk Only</option>
                            <option value="Normal">Normal Only</option>
                        </select>

                        <div className="flex bg-black/5 p-1 rounded-xl backdrop-blur-md text-xs">
                            <button
                                onClick={() => setViewMode('scatter')}
                                className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${viewMode === 'scatter' ? 'bg-white shadow-md text-primary' : 'text-gray-500'}`}>
                                CHART
                            </button>
                            <button
                                onClick={() => setViewMode('list')}
                                className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${viewMode === 'list' ? 'bg-white shadow-md text-primary' : 'text-gray-500'}`}>
                                LIST
                            </button>
                        </div>
                    </div>
                </div>

                {/* Render Selected View */}
                <div className="min-h-[400px]">
                    {viewMode === 'scatter' ? (
                        <div className="fade-in grid grid-cols-1 lg:grid-cols-2 gap-6">
                            <div className="h-80 flex items-center justify-center p-4 bg-white/30 rounded-2xl">
                                <Pie data={pieData} options={pieOptions} />
                            </div>
                            <div className="h-80 bg-white/30 rounded-2xl p-4">
                                <h4 className="font-bold text-gray-700 mb-2 text-sm uppercase tracking-wide">
                                    Zero-Deduction Alert
                                </h4>
                                <p className="text-xs text-gray-500 mb-3">
                                    Employees with no recorded voluntary deductions &mdash; a common ghost pattern.
                                </p>
                                <div className="h-64">
                                    <Bar data={zeroDeductionChartData} options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }} />
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="fade-in grid grid-cols-1 lg:grid-cols-[2fr,1.2fr] gap-6">
                            {/* Forensic List */}
                            <div className="overflow-x-auto rounded-xl">
                                <table className="min-w-full text-left text-sm whitespace-nowrap">
                                    <thead className="bg-white/40 uppercase text-xs font-bold text-gray-600">
                                        <tr>
                                            <th className="px-6 py-4">ID</th>
                                            <th className="px-6 py-4">Full Name</th>
                                            <th className="px-6 py-4">Department</th>
                                            <th className="px-6 py-4">Salary</th>
                                            <th className="px-6 py-4">Status</th>
                                            <th className="px-6 py-4 text-right">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-white/20">
                                        {filteredEmployees.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage).map((emp, index) => (
                                            <tr key={index} className="hover:bg-white/20 transition-colors">
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
                                    <div className="flex items-center justify-between px-6 py-3 border-t border-white/10 bg-white/10 mt-2 rounded-b-xl">
                                        <div className="text-sm text-gray-100">
                                            Showing <span className="font-medium">{((currentPage - 1) * itemsPerPage) + 1}</span> to <span className="font-medium">{Math.min(currentPage * itemsPerPage, filteredEmployees.length)}</span> of <span className="font-medium">{filteredEmployees.length}</span> results
                                        </div>
                                        <div className="flex bg-white/20 rounded-md shadow-sm border border-white/30">
                                            <button
                                                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                                                disabled={currentPage === 1}
                                                className="px-3 py-1 text-sm text-gray-800 hover:bg-white/40 disabled:opacity-50 disabled:cursor-not-allowed border-r border-white/30"
                                            >
                                                Previous
                                            </button>
                                            <button
                                                onClick={() => setCurrentPage(prev => Math.min(prev + 1, Math.ceil(filteredEmployees.length / itemsPerPage)))}
                                                disabled={currentPage === Math.ceil(filteredEmployees.length / itemsPerPage)}
                                                className="px-3 py-1 text-sm text-gray-800 hover:bg-white/40 disabled:opacity-50 disabled:cursor-not-allowed"
                                            >
                                                Next
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Bank Account Collisions */}
                            <div className="bg-white/30 backdrop-blur-sm rounded-2xl p-4 border border-white/20">
                                <h4 className="font-bold text-gray-700 mb-2 text-sm uppercase tracking-wide flex items-center gap-2">
                                    <Banknote className="w-4 h-4 text-red-500" />
                                    Bank Account Collisions
                                </h4>
                                <p className="text-xs text-gray-500 mb-3">
                                    Multiple employees mapped to the same bank account or IBAN.
                                </p>
                                {bankCollisions.length === 0 ? (
                                    <p className="text-xs text-emerald-600">No suspicious overlaps detected.</p>
                                ) : (
                                    <div className="space-y-2 text-xs max-h-64 overflow-y-auto pr-1">
                                        {bankCollisions.map((row, idx) => (
                                            <div key={idx} className="border border-white/30 rounded-xl p-2 bg-white/30">
                                                <div className="flex items-center justify-between mb-1">
                                                    <span className="font-semibold text-gray-800 truncate">Acct: {row.account}</span>
                                                    <span className="text-[0.7rem] text-red-600 font-semibold">
                                                        {row.count} matches
                                                    </span>
                                                </div>
                                                <p className="text-[0.7rem] text-gray-600">
                                                    {row.names}
                                                </p>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                {/* Managerial Tier – Departmental Risk & Budget vs Exposure */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-8">
                    <div className="lg:col-span-2 bg-white/30 backdrop-blur-sm p-6 rounded-2xl border border-white/20">
                        <h4 className="font-bold text-gray-700 mb-4 flex items-center gap-2">
                            <AlertTriangle className="w-4 h-4 text-red-500" />
                            Departmental Risk Density
                        </h4>
                        <p className="text-xs text-gray-500 mb-3">
                            Bar height reflects payroll size; color intensity reflects percentage of high‑risk employees.
                        </p>
                        <div className="h-64">
                            <Bar
                                data={{
                                    labels: departmentLabels,
                                    datasets: [
                                        {
                                            type: 'bar',
                                            label: 'Total Payroll ($)',
                                            data: departmentPayrollTotals,
                                            backgroundColor: 'rgba(59,130,246,0.6)',
                                            yAxisID: 'y',
                                        },
                                        {
                                            type: 'line',
                                            label: '% High Risk',
                                            data: departmentRiskPercentages,
                                            borderColor: 'rgba(239,68,68,1)',
                                            backgroundColor: 'rgba(239,68,68,0.2)',
                                            yAxisID: 'y1',
                                        },
                                    ],
                                }}
                                options={{
                                    responsive: true,
                                    maintainAspectRatio: false,
                                    scales: {
                                        y: { position: 'left', title: { display: true, text: 'Payroll ($)' } },
                                        y1: { position: 'right', grid: { drawOnChartArea: false }, title: { display: true, text: '% High Risk' } },
                                    },
                                }}
                            />
                        </div>
                    </div>

                    <div className="bg-primary text-white p-6 rounded-2xl shadow-lg flex flex-col justify-between">
                        <div>
                            <p className="text-blue-100 text-sm font-medium">Institute Exposure Snapshot</p>
                            <h2 className="text-4xl font-bold mt-2">${totalLoss.toLocaleString()}</h2>
                        </div>
                        <div className="bg-white/20 p-3 rounded-xl backdrop-blur-md text-xs">
                            <span className="font-bold">Insight:</span>{' '}
                            {anomalies.length > 0
                                ? `${anomalies.length} high-risk employees currently impacting exposure.`
                                : `Model currently detects no high-probability anomalies.`}
                            {employees.length > 0 && (
                                <span className="block mt-1 text-[0.7rem] text-blue-50">
                                    Avg. salary: {avgSalary.toLocaleString(undefined, { style: 'currency', currency: 'USD', minimumFractionDigits: 0 })} · Departments: {departmentCount}
                                </span>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Historical Trends Section */}
            {reports.length > 0 && (
                <div className="glass-card p-8 mt-4">
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
