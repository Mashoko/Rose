import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import DetailModal from '../components/DetailModal';
import { fetchEmployees, fetchReports, getAuthHeaders } from '../services/api';
import {
    Users, AlertTriangle, DollarSign, Activity, TrendingUp,
    Eye, ShieldCheck, Fingerprint, CheckCircle2, ChevronRight,
    BarChart3, BadgeAlert, Building2,
} from 'lucide-react';
import { Line, Bar, Pie } from 'react-chartjs-2';
import { AnimatePresence } from 'framer-motion';
import {
    Chart as ChartJS,
    CategoryScale, LinearScale, PointElement, LineElement,
    BarElement, ArcElement, Title, Tooltip, Legend,
} from 'chart.js';

ChartJS.register(
    CategoryScale, LinearScale, PointElement, LineElement,
    BarElement, ArcElement, Title, Tooltip, Legend,
);

// ─── helpers ──────────────────────────────────────────────────────────────────
const normScore = emp => {
    const s = Number(emp.anomalyScore ?? emp.score ?? 0);
    return s <= 1 && s > 0 ? Math.round(s * 100) : Math.round(s);
};

const initials = name =>
    (name || '??').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();

const isHighRisk = emp =>
    emp.isGhost === true || emp.riskLevel === 'High' || emp.riskLevel === 'Critical';

// ─── Dashboard ────────────────────────────────────────────────────────────────
const Dashboard = () => {
    const navigate = useNavigate();
    const [employees,        setEmployees]        = useState([]);
    const [reports,          setReports]          = useState([]);
    const [loading,          setLoading]          = useState(true);
    const [error,            setError]            = useState(null);
    const [selectedEmployee, setSelectedEmployee] = useState(null);
    const [filterDept,       setFilterDept]       = useState('All');
    const [filterRisk,       setFilterRisk]       = useState('All');
    const [currentPage,      setCurrentPage]      = useState(1);
    const [dashSummary,      setDashSummary]      = useState(null);
    const itemsPerPage = 10;

    // ── Data fetch ────────────────────────────────────────────────────────────
    const loadDashboardData = useCallback(async () => {
        setLoading(true); setError(null);
        try {
            const [empData, reportData, summaryRes] = await Promise.all([
                fetchEmployees(),
                fetchReports(),
                fetch('/api/dashboard/summary', { headers: getAuthHeaders() })
                    .then(r => r.ok ? r.json() : null).catch(() => null),
            ]);
            const empArray = empData && !Array.isArray(empData) && empData.employees
                ? empData.employees : empData;
            if (Array.isArray(empArray)) setEmployees(empArray);
            else setError('Could not load employee data.');
            if (reportData) setReports(reportData);
            if (summaryRes) setDashSummary(summaryRes);
        } catch {
            setError('An unexpected error occurred while loading the dashboard.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadDashboardData();
        const token = localStorage.getItem('token');
        const sse = new EventSource(
            token ? `/api/stream/reports?access_token=${encodeURIComponent(token)}`
                  : '/api/stream/reports'
        );
        sse.onmessage = e => {
            try { if (JSON.parse(e.data).event === 'new_report') setTimeout(loadDashboardData, 1500); }
            catch { /* ignore */ }
        };
        sse.onerror = () => sse.close();
        return () => sse.close();
    }, [loadDashboardData]);

    // ── Derived metrics ───────────────────────────────────────────────────────
    const departments      = ['All', ...new Set(employees.map(e => e.department).filter(Boolean))];
    const highRiskAll      = employees.filter(isHighRisk);
    const totalLoss        = highRiskAll.reduce((s, e) => s + (Number(e.salary) || 0), 0);
    const savingsFromAudit = employees.filter(e => e.status === 'Confirmed Ghost')
                                       .reduce((s, e) => s + (Number(e.salary) || 0), 0);
    const anomalyRate      = employees.length ? highRiskAll.length / employees.length : 0;
    const integrityScoreCalc = Math.max(0, Math.round(100 - anomalyRate * 100));
    const departmentCount  = new Set(employees.map(e => e.department).filter(Boolean)).size;
    const avgSalary        = employees.length
        ? employees.reduce((s, e) => s + (Number(e.salary) || 0), 0) / employees.length : 0;

    const departmentStats = employees.reduce((acc, emp) => {
        const dept = emp.department || 'Unassigned';
        if (!acc[dept]) acc[dept] = { payrollTotal: 0, employeeCount: 0, highRiskCount: 0 };
        acc[dept].payrollTotal  += Number(emp.salary) || 0;
        acc[dept].employeeCount += 1;
        if (isHighRisk(emp)) acc[dept].highRiskCount += 1;
        return acc;
    }, {});
    const departmentLabels          = Object.keys(departmentStats);
    const departmentPayrollTotals   = departmentLabels.map(d => departmentStats[d].payrollTotal);
    const departmentRiskPercentages = departmentLabels.map(d => {
        const s = departmentStats[d];
        return s.employeeCount ? +(s.highRiskCount / s.employeeCount * 100).toFixed(1) : 0;
    });

    const riskCounts = { Low: 0, Medium: 0, High: 0, Critical: 0 };
    employees.forEach(e => { if (riskCounts[e.riskLevel] !== undefined) riskCounts[e.riskLevel]++; });

    const filteredEmployees = employees.filter(emp => {
        if (filterDept !== 'All' && emp.department !== filterDept) return false;
        if (filterRisk === 'High Risk' && !isHighRisk(emp)) return false;
        if (filterRisk === 'Normal'    && isHighRisk(emp))  return false;
        return true;
    });

    // ── Chart data ────────────────────────────────────────────────────────────
    const pieData = {
        labels: ['Low Risk', 'Medium Risk', 'High Risk', 'Critical Risk'],
        datasets: [{
            data: [riskCounts.Low, riskCounts.Medium, riskCounts.High, riskCounts.Critical],
            backgroundColor: ['rgba(34,197,94,0.8)', 'rgba(234,179,8,0.8)', 'rgba(239,68,68,0.8)', 'rgba(126,34,206,0.8)'],
            borderColor:     ['rgb(34,197,94)',       'rgb(234,179,8)',       'rgb(239,68,68)',       'rgb(126,34,206)'],
            borderWidth: 2,
        }],
    };
    const pieOptions = {
        responsive: true, maintainAspectRatio: false,
        plugins: {
            legend: { position: 'bottom', labels: { padding: 12, font: { size: 11 } } },
            tooltip: { callbacks: { label: ctx => {
                const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
                return `${ctx.label}: ${ctx.parsed} (${total ? ((ctx.parsed / total) * 100).toFixed(0) : 0}%)`;
            }}},
        },
    };

    const now = new Date();
    const THIRTY_DAYS = 1000 * 60 * 60 * 24 * 30;
    const reportsLastMonth = reports
        .map(r => ({ ...r, _date: new Date(r.date || r.createdAt || r.updatedAt || now) }))
        .filter(r => !isNaN(r._date) && now - r._date <= THIRTY_DAYS)
        .sort((a, b) => a._date - b._date);

    const lineData = {
        labels: reportsLastMonth.map(r => r._date.toLocaleDateString()),
        datasets: [
            {
                label: 'Exposure ($)',
                data: reportsLastMonth.map(r => r.summary?.totalExposure || 0),
                borderColor: 'rgba(239,68,68,1)', backgroundColor: 'rgba(239,68,68,0.08)',
                borderWidth: 2, fill: true, tension: 0.4, yAxisID: 'y',
            },
            {
                label: 'Anomalies',
                data: reportsLastMonth.map(r => (r.summary?.highRiskCount || 0) + (r.summary?.mediumRiskCount || 0)),
                borderColor: 'rgba(59,130,246,1)', backgroundColor: 'transparent',
                borderWidth: 2, borderDash: [5, 5], tension: 0.4, yAxisID: 'y1',
            },
        ],
    };
    const lineOptions = {
        responsive: true, maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: { legend: { position: 'top' } },
        scales: {
            y:  { type: 'linear', position: 'left',  title: { display: true, text: 'Exposure ($)' } },
            y1: { type: 'linear', position: 'right', grid: { drawOnChartArea: false }, title: { display: true, text: 'Count' } },
        },
    };

    // ── handleListClick ───────────────────────────────────────────────────────
    const handleListClick = emp => {
        const riskMap = {
            Low: 'NORMAL EMPLOYEE', Medium: 'MEDIUM RISK ALERT',
            High: 'HIGH RISK ANOMALY', Critical: 'CRITICAL RISK - GHOST EMPLOYEE',
        };
        setSelectedEmployee({
            ...emp,
            name: emp.fullName,
            risk: emp.riskLevel,
            score: emp.anomalyScore,
            determination: {
                classification: riskMap[emp.riskLevel] || 'UNCLASSIFIED',
                confidence: emp.anomalyScore || 0,
                reasoning: [
                    emp.attendanceDays  != null ? `Attendance: ${Math.round(emp.attendanceDays)} days` : null,
                    emp.salary          != null ? `Salary: $${Math.round(emp.salary).toLocaleString()}` : null,
                    emp.biometricLogs   != null ? `Biometric Logs: ${emp.biometricLogs}` : null,
                    emp.isGhost ? 'Status: Flagged as potential ghost employee' : null,
                ].filter(Boolean),
            },
        });
    };

    const handleEmployeeUpdate = (id, newStatus) => {
        setEmployees(prev => prev.map(emp =>
            (emp.id || emp.employeeId) === id ? { ...emp, status: newStatus } : emp
        ));
        if (selectedEmployee && (selectedEmployee.id || selectedEmployee.employeeId) === id)
            setSelectedEmployee(s => ({ ...s, status: newStatus }));
    };

    // ── Loading / Error states ────────────────────────────────────────────────
    if (loading) return (
        <div className="space-y-6 pb-10 animate-pulse">
            <div className="h-8 bg-gray-200 rounded-xl w-64" />
            <div className="h-12 bg-gray-100 rounded-xl" />
            <div className="grid grid-cols-4 gap-4">
                {[...Array(4)].map((_, i) => (
                    <div key={i} className="bg-white rounded-2xl p-5 h-28 shadow-sm border border-gray-100" />
                ))}
            </div>
            <div className="grid grid-cols-2 gap-6">
                <div className="bg-white rounded-2xl h-72 shadow-sm border border-gray-100" />
                <div className="bg-white rounded-2xl h-72 shadow-sm border border-gray-100" />
            </div>
        </div>
    );

    if (error) return (
        <div className="flex items-center justify-center min-h-[420px]">
            <div className="bg-red-50 border border-red-200 rounded-2xl p-8 text-center max-w-sm">
                <AlertTriangle className="w-10 h-10 text-red-400 mx-auto mb-3" />
                <p className="font-semibold text-red-800 mb-1">Failed to load dashboard</p>
                <p className="text-sm text-red-600 mb-4">{error}</p>
                <button onClick={loadDashboardData}
                    className="px-5 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700">
                    Retry
                </button>
            </div>
        </div>
    );

    // ── KPI values (prefer API summary if available) ──────────────────────────
    const kpiTotal      = dashSummary?.totalEmployees    ?? employees.length;
    const kpiHighRisk   = dashSummary?.highRiskCount     ?? highRiskAll.length;
    const kpiExposure   = dashSummary?.totalExposure     ?? totalLoss;
    const kpiIntegrity  = dashSummary?.integrityScore    ?? integrityScoreCalc;
    const kpiBiometric  = dashSummary?.biometricCoverage ?? 0;
    const kpiConfirmed  = dashSummary?.confirmedGhostsCount ?? 0;

    // ── Render ────────────────────────────────────────────────────────────────
    return (
        <div className="space-y-6 pb-12">

            {/* ── 1. Page Header ── */}
            <div className="fade-in flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2">
                <div>
                    <div className="flex items-center gap-2 mb-1">
                        <ShieldCheck className="w-5 h-5 text-primary" />
                        <span className="text-[0.65rem] font-bold uppercase tracking-widest text-primary/70">
                            Ghost Employee Management System
                        </span>
                    </div>
                    <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">Dashboard</h1>
                    <p className="text-sm text-gray-400 mt-0.5">Live payroll integrity monitor · {kpiTotal} employees tracked</p>
                </div>
                <div className="flex flex-col sm:items-end gap-1">
                    <span className="text-xs text-gray-400">
                        {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                    </span>
                    {reportsLastMonth.length > 0 && (
                        <button onClick={() => navigate('/reports')}
                            className="text-xs text-primary hover:underline flex items-center gap-1">
                            <TrendingUp className="w-3 h-3" />
                            Latest analysis: {reportsLastMonth[reportsLastMonth.length - 1]._date.toLocaleString()}
                        </button>
                    )}
                </div>
            </div>

            {/* ── 2. System Status Banner ── */}
            {(() => {
                if (kpiHighRisk === 0) return (
                    <div className="fade-in flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-xl px-5 py-3.5">
                        <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
                        <div className="flex-1">
                            <p className="text-sm font-semibold text-emerald-800">All Clear — No ghost employee signals detected</p>
                            <p className="text-xs text-emerald-600 mt-0.5">
                                {kpiTotal} employee records analyzed · Payroll integrity is within acceptable thresholds.
                            </p>
                        </div>
                        <span className="text-xs font-bold text-emerald-700 bg-emerald-100 px-3 py-1 rounded-full shrink-0">SECURE</span>
                    </div>
                );
                if (kpiHighRisk <= 3) return (
                    <div className="fade-in flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl px-5 py-3.5">
                        <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />
                        <div className="flex-1">
                            <p className="text-sm font-semibold text-amber-800">
                                {kpiHighRisk} high-risk employee{kpiHighRisk !== 1 ? 's' : ''} require review
                            </p>
                            <p className="text-xs text-amber-700 mt-0.5">
                                Estimated payroll exposure: ${kpiExposure.toLocaleString()} / month · Audit recommended before next payroll run.
                            </p>
                        </div>
                        <span className="text-xs font-bold text-amber-700 bg-amber-100 px-3 py-1 rounded-full shrink-0">REVIEW</span>
                    </div>
                );
                return (
                    <div className="fade-in flex items-center gap-3 bg-red-50 border border-red-300 rounded-xl px-5 py-3.5">
                        <AlertTriangle className="w-5 h-5 text-red-500 shrink-0" />
                        <div className="flex-1">
                            <p className="text-sm font-semibold text-red-800">
                                ALERT — {kpiHighRisk} employees flagged as potential ghost employees
                            </p>
                            <p className="text-xs text-red-600 mt-0.5">
                                Monthly payroll exposure: ${kpiExposure.toLocaleString()} · Immediate investigation and payroll suspension recommended.
                            </p>
                        </div>
                        <span className="text-xs font-bold text-red-700 bg-red-100 px-3 py-1 rounded-full shrink-0 animate-pulse">CRITICAL</span>
                    </div>
                );
            })()}

            {/* ── 3. KPI Cards ── */}
            <div className="fade-in grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                {/* Total Employees */}
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex items-center gap-4 hover:shadow-md transition-shadow">
                    <div className="p-3 rounded-xl bg-blue-50 shrink-0">
                        <Users className="w-6 h-6 text-blue-600" />
                    </div>
                    <div className="min-w-0">
                        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Total Employees</p>
                        <p className="text-2xl font-bold text-gray-900 mt-0.5">{kpiTotal}</p>
                        <p className="text-xs text-gray-400">{departmentCount} departments · avg ${Math.round(avgSalary).toLocaleString()}/mo</p>
                    </div>
                </div>

                {/* High Risk */}
                <div
                    onClick={() => setFilterRisk('High Risk')}
                    className="bg-white rounded-2xl border-l-4 border-l-red-400 border border-gray-100 shadow-sm p-5 flex items-center gap-4 cursor-pointer hover:shadow-md transition-shadow"
                >
                    <div className="p-3 rounded-xl bg-red-50 shrink-0">
                        <BadgeAlert className="w-6 h-6 text-red-500" />
                    </div>
                    <div className="min-w-0">
                        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">High-Risk Flagged</p>
                        <p className="text-2xl font-bold text-red-600 mt-0.5">{kpiHighRisk}</p>
                        <p className="text-xs text-gray-400">{kpiConfirmed} confirmed ghost{kpiConfirmed !== 1 ? 's' : ''} · click to filter</p>
                    </div>
                </div>

                {/* Payroll Exposure */}
                <div
                    onClick={() => navigate('/reports')}
                    className="bg-white rounded-2xl border-l-4 border-l-amber-400 border border-gray-100 shadow-sm p-5 flex items-center gap-4 cursor-pointer hover:shadow-md transition-shadow"
                >
                    <div className="p-3 rounded-xl bg-amber-50 shrink-0">
                        <DollarSign className="w-6 h-6 text-amber-600" />
                    </div>
                    <div className="min-w-0">
                        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Payroll Exposure</p>
                        <p className="text-2xl font-bold text-gray-900 mt-0.5">${kpiExposure.toLocaleString()}</p>
                        <p className="text-xs text-gray-400">
                            {savingsFromAudit > 0 ? `$${savingsFromAudit.toLocaleString()} recovered via audits` : 'Potential monthly loss if unaddressed'}
                        </p>
                    </div>
                </div>

                {/* Integrity Score */}
                <div className="bg-white rounded-2xl border-l-4 border-l-emerald-400 border border-gray-100 shadow-sm p-5 flex items-center gap-4 hover:shadow-md transition-shadow">
                    <div className="p-3 rounded-xl bg-emerald-50 shrink-0">
                        <ShieldCheck className="w-6 h-6 text-emerald-600" />
                    </div>
                    <div className="min-w-0">
                        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Integrity Score</p>
                        <p className="text-2xl font-bold text-gray-900 mt-0.5">{kpiIntegrity}%</p>
                        <p className="text-xs text-gray-400">
                            <Fingerprint className="inline w-3 h-3 mr-0.5" />
                            Biometric coverage: {kpiBiometric}%
                        </p>
                    </div>
                </div>
            </div>

            {/* ── 4. Risk Distribution + Top Flagged Employees ── */}
            <div className="fade-in grid grid-cols-1 lg:grid-cols-[1fr,1.5fr] gap-6">

                {/* Risk Pie */}
                <div className="glass-card p-6">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-4 flex items-center gap-2">
                        <Activity className="w-4 h-4 text-blue-500" />
                        Risk Level Distribution
                    </h3>
                    <div className="h-52">
                        <Pie data={pieData} options={pieOptions} />
                    </div>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 mt-4">
                        {[
                            { label: 'Low',      count: riskCounts.Low,      color: 'bg-emerald-500' },
                            { label: 'Medium',   count: riskCounts.Medium,   color: 'bg-yellow-400' },
                            { label: 'High',     count: riskCounts.High,     color: 'bg-red-500' },
                            { label: 'Critical', count: riskCounts.Critical, color: 'bg-purple-500' },
                        ].map(({ label, count, color }) => (
                            <div key={label} className="flex items-center gap-2 text-xs text-gray-600">
                                <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${color}`} />
                                <span>{label}: <strong>{count}</strong></span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Top Flagged Employees */}
                <div className="glass-card p-6 flex flex-col">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-4 flex items-center gap-2">
                        <BadgeAlert className="w-4 h-4 text-red-500" />
                        Top Flagged Employees
                        {highRiskAll.length > 0 && (
                            <span className="ml-auto text-[0.65rem] font-bold text-red-600 bg-red-50 border border-red-100 px-2 py-0.5 rounded-full">
                                {highRiskAll.length} flagged
                            </span>
                        )}
                    </h3>

                    {highRiskAll.length === 0 ? (
                        <div className="flex-1 flex flex-col items-center justify-center gap-2 py-6">
                            <CheckCircle2 className="w-10 h-10 text-emerald-400" />
                            <p className="text-sm text-gray-400">No high-risk employees detected.</p>
                        </div>
                    ) : (
                        <div className="space-y-2 flex-1">
                            {[...highRiskAll]
                                .sort((a, b) => normScore(b) - normScore(a))
                                .slice(0, 5)
                                .map((emp, idx) => {
                                    const s = normScore(emp);
                                    return (
                                        <div
                                            key={emp.employeeId || emp.id || idx}
                                            onClick={() => handleListClick(emp)}
                                            className="flex items-center gap-3 p-3 bg-white/70 hover:bg-white rounded-xl border border-red-100 cursor-pointer transition-all hover:shadow-sm group"
                                        >
                                            <div className="w-9 h-9 rounded-full bg-red-100 flex items-center justify-center text-xs font-bold text-red-700 shrink-0">
                                                {initials(emp.fullName || emp.name)}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-semibold text-gray-900 truncate">{emp.fullName || emp.name}</p>
                                                <p className="text-[0.65rem] text-gray-500 truncate">{emp.department} · {emp.employeeId || emp.id}</p>
                                            </div>
                                            <div className="text-right shrink-0">
                                                <p className="text-sm font-bold text-red-600">
                                                    {s}<span className="text-[0.65rem] font-normal text-gray-400">/100</span>
                                                </p>
                                                <p className="text-[0.6rem] text-gray-400">${(Number(emp.salary) || 0).toLocaleString()}/mo</p>
                                            </div>
                                            <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-gray-500 transition-colors shrink-0" />
                                        </div>
                                    );
                                })}
                        </div>
                    )}

                    {highRiskAll.length > 5 && (
                        <button
                            onClick={() => setFilterRisk('High Risk')}
                            className="mt-3 w-full text-xs text-center text-primary hover:underline font-medium"
                        >
                            + {highRiskAll.length - 5} more flagged employees — view all
                        </button>
                    )}
                </div>
            </div>

            {/* ── 5. Department Overview ── */}
            <div className="fade-in">
                <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-3 flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-blue-500" />
                    Department Overview
                    <span className="font-normal normal-case text-gray-400">— click to filter employee table</span>
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3">
                    {departmentLabels.map(dept => {
                        const s = departmentStats[dept];
                        const riskPct = s.employeeCount ? Math.round((s.highRiskCount / s.employeeCount) * 100) : 0;
                        const isActive = filterDept === dept;
                        const riskClass = riskPct >= 30
                            ? 'border-red-200 bg-red-50'
                            : riskPct >= 10
                            ? 'border-amber-200 bg-amber-50'
                            : 'border-gray-100 bg-white';
                        const barClass = riskPct >= 30 ? 'bg-red-400' : riskPct >= 10 ? 'bg-amber-400' : 'bg-emerald-400';
                        const textClass = riskPct >= 30 ? 'text-red-600' : riskPct >= 10 ? 'text-amber-600' : 'text-emerald-600';

                        return (
                            <div
                                key={dept}
                                onClick={() => { setFilterDept(isActive ? 'All' : dept); setCurrentPage(1); }}
                                className={`rounded-xl border p-4 shadow-sm cursor-pointer transition-all hover:shadow-md ${riskClass} ${isActive ? 'ring-2 ring-primary' : ''}`}
                            >
                                <p className="text-xs font-semibold text-gray-700 truncate leading-tight mb-2">{dept}</p>
                                <p className="text-xl font-bold text-gray-900">{s.employeeCount}</p>
                                <p className="text-[0.6rem] text-gray-400 mb-2">employees</p>
                                <div className="flex items-center justify-between text-[0.65rem]">
                                    <span className={`font-bold ${textClass}`}>{riskPct}% risk</span>
                                    <span className="text-gray-400">${s.payrollTotal.toLocaleString()}</span>
                                </div>
                                <div className="mt-1.5 h-1 bg-gray-200 rounded-full overflow-hidden">
                                    <div className={`h-full rounded-full ${barClass} transition-all`}
                                        style={{ width: `${Math.min(100, riskPct)}%` }} />
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* ── 6. Employee Records Table ── */}
            <div className="fade-in glass-card p-6">
                <div className="flex items-center justify-between flex-wrap gap-3 mb-5">
                    <h3 className="text-base font-bold text-gray-800 flex items-center gap-2">
                        <Users className="w-5 h-5 text-blue-500" />
                        Employee Records
                        <span className="text-xs font-normal text-gray-400">({filteredEmployees.length} shown)</span>
                    </h3>
                    <div className="flex flex-wrap items-center gap-2">
                        <select
                            value={filterDept}
                            onChange={e => { setFilterDept(e.target.value); setCurrentPage(1); }}
                            className="px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-primary/30"
                        >
                            {departments.map(d => <option key={d}>{d}</option>)}
                        </select>
                        <select
                            value={filterRisk}
                            onChange={e => { setFilterRisk(e.target.value); setCurrentPage(1); }}
                            className="px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-primary/30"
                        >
                            <option value="All">All Risk Levels</option>
                            <option value="High Risk">High Risk Only</option>
                            <option value="Normal">Normal Only</option>
                        </select>
                        {(filterDept !== 'All' || filterRisk !== 'All') && (
                            <button
                                onClick={() => { setFilterDept('All'); setFilterRisk('All'); setCurrentPage(1); }}
                                className="text-xs text-gray-400 hover:text-gray-700 underline"
                            >
                                Clear filters
                            </button>
                        )}
                    </div>
                </div>

                <div className="overflow-x-auto rounded-xl border border-gray-100">
                    <table className="min-w-full text-sm">
                        <thead>
                            <tr className="bg-gray-50 text-[0.68rem] font-semibold text-gray-500 uppercase tracking-wider">
                                <th className="px-4 py-3 text-left">Employee</th>
                                <th className="px-4 py-3 text-left">Department</th>
                                <th className="px-4 py-3 text-left">Salary</th>
                                <th className="px-4 py-3 text-left">Attendance</th>
                                <th className="px-4 py-3 text-left">Risk Score</th>
                                <th className="px-4 py-3 text-left">Status</th>
                                <th className="px-4 py-3 text-right">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 bg-white">
                            {filteredEmployees.length === 0 ? (
                                <tr>
                                    <td colSpan={7} className="px-4 py-12 text-center">
                                        <Users className="w-8 h-8 text-gray-200 mx-auto mb-2" />
                                        <p className="text-sm text-gray-400">No employees match the current filters.</p>
                                    </td>
                                </tr>
                            ) : (
                                filteredEmployees
                                    .slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)
                                    .map((emp, idx) => {
                                        const risky = isHighRisk(emp);
                                        const s = normScore(emp);
                                        const scoreClass = s >= 70 ? 'text-red-600 bg-red-50 border-red-100'
                                                         : s >= 40 ? 'text-amber-600 bg-amber-50 border-amber-100'
                                                         : s > 0   ? 'text-emerald-600 bg-emerald-50 border-emerald-100'
                                                         : '';
                                        const att = emp.attendanceDays;

                                        return (
                                            <tr key={idx} className={`hover:bg-gray-50/80 transition-colors ${risky ? 'bg-red-50/30' : ''}`}>
                                                <td className="px-4 py-3">
                                                    <div className="flex items-center gap-2.5">
                                                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${risky ? 'bg-red-100 text-red-700' : 'bg-blue-50 text-blue-700'}`}>
                                                            {initials(emp.fullName)}
                                                        </div>
                                                        <div>
                                                            <p className="font-medium text-gray-900">{emp.fullName}</p>
                                                            <p className="text-[0.62rem] text-gray-400">{emp.employeeId || emp.id}</p>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3 text-gray-600">{emp.department}</td>
                                                <td className="px-4 py-3 font-mono text-gray-800">${(Number(emp.salary) || 0).toLocaleString()}</td>
                                                <td className="px-4 py-3">
                                                    {att != null ? (
                                                        <span className={`text-xs ${att === 0 ? 'text-red-600 font-bold' : att < 5 ? 'text-amber-600' : 'text-gray-600'}`}>
                                                            {att} / 22 days
                                                        </span>
                                                    ) : <span className="text-xs text-gray-300">—</span>}
                                                </td>
                                                <td className="px-4 py-3">
                                                    {s > 0 ? (
                                                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${scoreClass}`}>
                                                            {s}/100
                                                        </span>
                                                    ) : <span className="text-xs text-gray-300">—</span>}
                                                </td>
                                                <td className="px-4 py-3">
                                                    {(() => {
                                                        if (emp.status === 'Confirmed Ghost')
                                                            return <span className="text-[0.68rem] font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-700">Confirmed Ghost</span>;
                                                        if (emp.status === 'Under Investigation')
                                                            return <span className="text-[0.68rem] font-semibold px-2 py-0.5 rounded-full bg-orange-100 text-orange-700">Investigating</span>;
                                                        if (emp.status === 'False Positive')
                                                            return <span className="text-[0.68rem] font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">Cleared</span>;
                                                        return risky
                                                            ? <span className="text-[0.68rem] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">Flagged</span>
                                                            : <span className="text-[0.68rem] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">Normal</span>;
                                                    })()}
                                                </td>
                                                <td className="px-4 py-3 text-right">
                                                    <button
                                                        onClick={() => handleListClick(emp)}
                                                        className="inline-flex items-center gap-1 text-xs text-primary hover:text-blue-700 font-medium"
                                                    >
                                                        <Eye className="w-3.5 h-3.5" /> Audit Card
                                                    </button>
                                                </td>
                                            </tr>
                                        );
                                    })
                            )}
                        </tbody>
                    </table>
                </div>

                {filteredEmployees.length > itemsPerPage && (
                    <div className="flex items-center justify-between pt-4 border-t border-gray-100 mt-2">
                        <p className="text-xs text-gray-400">
                            Showing {((currentPage - 1) * itemsPerPage) + 1}–{Math.min(currentPage * itemsPerPage, filteredEmployees.length)} of {filteredEmployees.length}
                        </p>
                        <div className="flex gap-1">
                            <button onClick={() => setCurrentPage(p => Math.max(p - 1, 1))} disabled={currentPage === 1}
                                className="px-3 py-1.5 text-xs rounded-lg border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-40">
                                Previous
                            </button>
                            <button
                                onClick={() => setCurrentPage(p => Math.min(p + 1, Math.ceil(filteredEmployees.length / itemsPerPage)))}
                                disabled={currentPage === Math.ceil(filteredEmployees.length / itemsPerPage)}
                                className="px-3 py-1.5 text-xs rounded-lg border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-40">
                                Next
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* ── 7. Departmental Payroll vs Risk Chart ── */}
            <div className="fade-in glass-card p-6">
                <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-5 flex items-center gap-2">
                    <BarChart3 className="w-4 h-4 text-blue-500" />
                    Departmental Payroll vs Risk Exposure
                </h3>
                <div className="grid grid-cols-1 lg:grid-cols-[2fr,1fr] gap-6 items-start">
                    <div className="h-60">
                        <Bar
                            data={{
                                labels: departmentLabels,
                                datasets: [
                                    { type: 'bar',  label: 'Total Payroll ($)',  data: departmentPayrollTotals,   backgroundColor: 'rgba(59,130,246,0.55)', yAxisID: 'y' },
                                    { type: 'line', label: '% High Risk',        data: departmentRiskPercentages, borderColor: 'rgba(239,68,68,1)', backgroundColor: 'rgba(239,68,68,0.1)', yAxisID: 'y1', tension: 0.3, pointRadius: 4 },
                                ],
                            }}
                            options={{
                                responsive: true, maintainAspectRatio: false,
                                plugins: { legend: { position: 'top' } },
                                scales: {
                                    y:  { position: 'left',  title: { display: true, text: 'Payroll ($)' } },
                                    y1: { position: 'right', grid: { drawOnChartArea: false }, title: { display: true, text: '% High Risk' }, max: 100 },
                                },
                            }}
                        />
                    </div>
                    {/* Exposure snapshot */}
                    <div className="bg-primary rounded-2xl p-5 text-white flex flex-col justify-between h-full min-h-[140px]">
                        <div>
                            <p className="text-blue-100 text-xs font-semibold uppercase tracking-wide mb-1">Institute Exposure Snapshot</p>
                            <p className="text-3xl font-bold">${kpiExposure.toLocaleString()}</p>
                            <p className="text-blue-200 text-xs mt-1">Monthly risk exposure</p>
                        </div>
                        <div className="mt-4 bg-white/15 rounded-xl px-3 py-2 text-xs">
                            {highRiskAll.length > 0
                                ? `${highRiskAll.length} high-risk employees currently impacting exposure.`
                                : 'No high-probability anomalies currently detected.'}
                            {savingsFromAudit > 0 && (
                                <p className="text-blue-100 mt-0.5">${savingsFromAudit.toLocaleString()} recovered via confirmed-ghost audits.</p>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* ── 8. Historical Trends ── */}
            {reports.length > 0 && (
                <div className="fade-in glass-card p-6">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-4 flex items-center gap-2">
                        <TrendingUp className="w-4 h-4 text-red-500" />
                        Historical Exposure Trends (last 30 days)
                    </h3>
                    <div className="h-60">
                        <Line data={lineData} options={lineOptions} />
                    </div>
                </div>
            )}

            {/* ── Audit Card Modal ── */}
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
