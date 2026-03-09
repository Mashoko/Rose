import React, { useMemo, useState } from 'react';
import { UploadCloud, FileText, CheckCircle, AlertTriangle, Eye, X } from 'lucide-react';
import clsx from 'clsx';
import { motion, AnimatePresence } from 'framer-motion';
import DetailModal from '../components/DetailModal';
import { Doughnut } from 'react-chartjs-2';
import {
    Chart as ChartJS,
    ArcElement,
    Tooltip,
    Legend
} from 'chart.js';

ChartJS.register(ArcElement, Tooltip, Legend);

const LoadingState = () => (
    <div className="flex flex-col items-center justify-center min-h-[320px] w-full">
        {/* Pulse & Scan animation */}
        <div className="relative flex items-center justify-center h-32 w-32">
            {/* Outer pulse rings */}
            <div className="absolute inset-0 rounded-full bg-blue-500/15 animate-ping" />
            <div className="absolute inset-4 rounded-full bg-blue-400/20 animate-pulse" />

            {/* Central rotating ring */}
            <div className="relative h-16 w-16 border-4 border-primary border-t-transparent rounded-full animate-spin shadow-[0_0_25px_rgba(30,64,175,0.35)]" />

            {/* Radar dot */}
            <div className="absolute top-1 h-3 w-3 bg-primary rounded-full shadow-[0_0_12px_rgba(30,64,175,0.85)]" />
        </div>

        {/* Subtext */}
        <div className="mt-8 text-center">
            <h3 className="text-xl font-semibold text-slate-700 animate-pulse">
                Analyzing patterns...
            </h3>
            <p className="text-xs md:text-sm text-slate-400 mt-2 tracking-[0.25em] uppercase">
                Analysing the Data...
            </p>
        </div>
    </div>
);

const Analysis = () => {
    const [step, setStep] = useState(1); // 1: Upload, 2: Processing, 3: Results
    const [selectedEmployee, setSelectedEmployee] = useState(null);
    const [employees, setAnalysisResults] = useState([]);
    const [riskChartData, setRiskChartData] = useState(null);
    const [payrollFile, setPayrollFile] = useState(null);
    const [attendanceFile, setAttendanceFile] = useState(null);

    const riskCounts = useMemo(() => {
        const low = employees.filter(e => e.risk === 'Low').length;
        const medium = employees.filter(e => e.risk === 'Medium').length;
        const high = employees.filter(e => e.risk === 'High' || e.risk === 'Critical').length;
        const total = employees.length;
        const highPct = total ? Math.round((high / total) * 100) : 0;
        return { low, medium, high, total, highPct };
    }, [employees]);

    const doughnutCenterPlugin = useMemo(() => ({
        id: 'doughnutCenterText',
        beforeDraw(chart) {
            const { ctx, chartArea } = chart;
            if (!chartArea) return;

            const centerX = (chartArea.left + chartArea.right) / 2;
            const centerY = (chartArea.top + chartArea.bottom) / 2;

            const total = riskCounts.total || 0;
            const high = riskCounts.high || 0;
            const pct = riskCounts.highPct || 0;

            ctx.save();
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';

            ctx.fillStyle = '#0f172a'; // slate-900
            ctx.font = '700 22px Inter, ui-sans-serif, system-ui';
            ctx.fillText(`${pct}%`, centerX, centerY - 10);

            ctx.fillStyle = '#64748b'; // slate-500
            ctx.font = '600 12px Inter, ui-sans-serif, system-ui';
            ctx.fillText(`Ghost risk`, centerX, centerY + 12);

            ctx.fillStyle = '#94a3b8'; // slate-400
            ctx.font = '500 11px Inter, ui-sans-serif, system-ui';
            ctx.fillText(`${high} of ${total} flagged`, centerX, centerY + 30);

            ctx.restore();
        }
    }), [riskCounts]);

    const saveReportToDatabase = async (mappedData, filename) => {
        try {
            const highRiskItems = mappedData.filter(e => e.risk === 'High');
            const mediumRiskItems = mappedData.filter(e => e.risk === 'Medium');

            const totalExposure = [...highRiskItems, ...mediumRiskItems].reduce(
                (acc, curr) => acc + (Number(curr.salary) || 0), 0
            );

            const sum = {
                totalAnalyzed: mappedData.length,
                highRiskCount: highRiskItems.length,
                mediumRiskCount: mediumRiskItems.length,
                lowRiskCount: mappedData.filter(e => e.risk === 'Low').length,
                totalExposure: totalExposure
            };

            const payload = {
                reportName: `Analysis Run: ${filename || 'Unknown File'}`,
                summary: sum,
                details: mappedData
            };

            const token = localStorage.getItem('token'); // Grab token if it exists

            await fetch("http://localhost:5000/api/reports", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    ...(token && { "Authorization": `Bearer ${token}` })
                },
                body: JSON.stringify(payload),
            });
            console.log("Report saved to database successfully.");
        } catch (error) {
            console.error("Failed to save report to database:", error);
        }
    };

    const handleAnalyze = async () => {
        if (!payrollFile || !attendanceFile) {
            alert("Please upload both Payroll and Attendance files.");
            return;
        }

        setStep(2);

        const formData = new FormData();
        formData.append("payroll_file", payrollFile);
        formData.append("attendance_file", attendanceFile);

        try {
            const response = await fetch("http://localhost:8000/analyze", {
                method: "POST",
                body: formData,
            });

            const result = await response.json();

            if (result.status === "success") {
                const mappedData = result.data.map(item => ({
                    id: item.id || item.employee_id || item.Employee_ID || `EMP-${Math.floor(Math.random() * 10000)}`,
                    name: item.name || item.Name || item.fullName || "Unknown Employee",
                    department: item.department || item.Department || "Unknown",
                    // round numeric values for display
                    salary: Math.round(item.salary || item.Monthly_Salary || 0),
                    daysPresent: Math.round(item.attendanceDays || item.Days_Present || 20),
                    risk: item.Risk_Level || item.riskLevel || 'Low',
                    score: item.Reconstruction_Error ? Math.round(item.Reconstruction_Error * 100) : 0,
                    explanation: item.explanation || "No explanation available"
                }));

                setAnalysisResults(mappedData);

                // Prepare pie chart data showing risk distribution
                const lowCount = mappedData.filter(e => e.risk === 'Low').length;
                const mediumCount = mappedData.filter(e => e.risk === 'Medium').length;
                const highCount = mappedData.filter(e => e.risk === 'High').length;

                setRiskChartData({
                    labels: ['Normal (Low Risk)', 'Suspicious (Medium Risk)', 'Ghosts (High Risk)'],
                    datasets: [
                        {
                            label: 'Employee Count',
                            data: [lowCount, mediumCount, highCount],
                            backgroundColor: [
                                'rgba(34, 197, 94, 0.85)',   // Green
                                'rgba(234, 179, 8, 0.85)',   // Yellow
                                'rgba(239, 68, 68, 0.85)'    // Red
                            ],
                            borderWidth: 0,
                            spacing: 3,
                            hoverOffset: 8,
                            borderRadius: 10,
                        }
                    ]
                });

                // Auto-save the results to our MongoDB Database via Node/Express Backend
                saveReportToDatabase(mappedData, `${payrollFile.name} & ${attendanceFile.name}`);

                setStep(3);
            } else {
                alert("Error processing file: " + result.error);
                setStep(1);
            }
        } catch (error) {
            console.error("Error:", error);
            alert("Failed to connect to the server.");
            setStep(1);
        }
    };

    return (
        <div className="space-y-8 relative">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold text-gray-900">Analysis & Detection</h1>
                {step === 3 && (
                    <button onClick={() => { setStep(1); setPayrollFile(null); setAttendanceFile(null); }} className="text-sm text-primary hover:underline">
                        Start New Analysis
                    </button>
                )}
            </div>

            {/* Step 1: Upload */}
            {step === 1 && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-white rounded-xl shadow-sm border border-gray-100 p-8">
                    {/* Payroll Upload */}
                    <div className="border-2 border-dashed border-gray-300 rounded-2xl p-8 flex flex-col items-center justify-center text-center hover:border-primary transition-colors cursor-pointer group relative">
                        <input
                            type="file"
                            accept=".csv, .xlsx, .xls"
                            onChange={(e) => setPayrollFile(e.target.files?.[0])}
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                        />
                        <div className="w-12 h-12 bg-blue-50 text-primary rounded-full flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                            <FileText className="w-6 h-6" />
                        </div>
                        <h3 className="text-lg font-bold text-gray-800 mb-1">Upload Payroll</h3>
                        <p className="text-sm text-gray-500 mb-2">.csv, .xlsx</p>
                        {payrollFile && <p className="text-sm font-semibold text-primary">{payrollFile.name}</p>}
                    </div>

                    {/* Attendance Upload */}
                    <div className="border-2 border-dashed border-gray-300 rounded-2xl p-8 flex flex-col items-center justify-center text-center hover:border-primary transition-colors cursor-pointer group relative">
                        <input
                            type="file"
                            accept=".csv, .xlsx, .xls"
                            onChange={(e) => setAttendanceFile(e.target.files?.[0])}
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                        />
                        <div className="w-12 h-12 bg-blue-50 text-primary rounded-full flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                            <UploadCloud className="w-6 h-6" />
                        </div>
                        <h3 className="text-lg font-bold text-gray-800 mb-1">Upload Attendance</h3>
                        <p className="text-sm text-gray-500 mb-2">.csv, .xlsx</p>
                        {attendanceFile && <p className="text-sm font-semibold text-primary">{attendanceFile.name}</p>}
                    </div>

                    <div className="md:col-span-2 flex justify-center mt-4">
                        <button
                            onClick={handleAnalyze}
                            disabled={!payrollFile || !attendanceFile}
                            className={`px-8 py-3 rounded-xl font-bold text-white transition-all ${(!payrollFile || !attendanceFile) ? 'bg-gray-300 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700 shadow-md hover:shadow-lg'}`}
                        >
                            Analyze Data
                        </button>
                    </div>
                </div>
            )}

            {/* Step 2: Processing */}
            {step === 2 && (
                <div className="glass-card p-10 flex flex-col items-center justify-center">
                    <LoadingState />
                </div>
            )}

            {/* Step 3: Results Dashboard */}
            {step === 3 && (
                <div className="space-y-6">
                    {/* Visual Analytics */}
                    <div className="glass-card p-6">
                        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 mb-4">
                            <div>
                                <h3 className="text-lg font-bold text-gray-800">Risk Distribution</h3>
                                <p className="text-xs text-gray-500">
                                    Executive snapshot of normal vs suspicious vs ghost-risk population.
                                </p>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                <span className="px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-700 border border-emerald-500/20">
                                    Low: {riskCounts.low}
                                </span>
                                <span className="px-3 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-700 border border-amber-500/20">
                                    Medium: {riskCounts.medium}
                                </span>
                                <span className="px-3 py-1 rounded-full text-xs font-semibold bg-red-500/10 text-red-700 border border-red-500/20">
                                    High (Ghost): {riskCounts.high}
                                </span>
                                <span className="px-3 py-1 rounded-full text-xs font-semibold bg-slate-500/10 text-slate-700 border border-slate-500/20">
                                    Total: {riskCounts.total}
                                </span>
                            </div>
                        </div>

                        {riskChartData && (
                            <div className="grid grid-cols-1 lg:grid-cols-[1.2fr,1fr] gap-6 items-center">
                                <div className="h-80 md:h-96 bg-white/30 rounded-2xl border border-white/20 p-4">
                                    <Doughnut
                                        data={riskChartData}
                                        plugins={[doughnutCenterPlugin]}
                                        options={{
                                            responsive: true,
                                            maintainAspectRatio: false,
                                            cutout: '72%',
                                            plugins: {
                                                legend: {
                                                    position: 'bottom',
                                                    labels: {
                                                        boxWidth: 10,
                                                        boxHeight: 10,
                                                        usePointStyle: true,
                                                        pointStyle: 'circle',
                                                        padding: 14,
                                                        font: { size: 12, weight: '600' }
                                                    }
                                                },
                                                tooltip: {
                                                    callbacks: {
                                                        label: function (context) {
                                                            const label = context.label || '';
                                                            const value = context.parsed || 0;
                                                            const total = context.dataset.data.reduce((a, b) => a + b, 0);
                                                            const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : 0;
                                                            return `${label}: ${value} employees (${percentage}%)`;
                                                        }
                                                    }
                                                }
                                            }
                                        }}
                                    />
                                </div>

                                <div className="space-y-4">
                                    <div className="bg-white/30 rounded-2xl border border-white/20 p-4">
                                        <p className="text-xs uppercase tracking-wide text-gray-500 font-semibold">
                                            Ghost risk signal
                                        </p>
                                        <p className="mt-1 text-2xl font-extrabold text-gray-900">
                                            {riskCounts.highPct}%
                                        </p>
                                        <p className="text-xs text-gray-500">
                                            of scanned employees are in the high-risk (ghost) category.
                                        </p>
                                    </div>
                                    <div className="bg-white/30 rounded-2xl border border-white/20 p-4">
                                        <p className="text-xs uppercase tracking-wide text-gray-500 font-semibold">
                                            Next actions
                                        </p>
                                        <ul className="mt-2 text-sm text-gray-700 space-y-1">
                                            <li className="flex items-start gap-2">
                                                <AlertTriangle className="w-4 h-4 text-red-500 mt-0.5" />
                                                Review high-risk employees first; export to Reports for audit trail.
                                            </li>
                                            <li className="flex items-start gap-2">
                                                <CheckCircle className="w-4 h-4 text-emerald-600 mt-0.5" />
                                                Use “Explain” to document reasoning and evidence for each record.
                                            </li>
                                        </ul>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Data Grid */}
                    <div className="glass-card overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="bg-gray-50 border-b border-gray-200 text-xs uppercase tracking-wider text-gray-500">
                                        <th className="p-4 font-semibold">ID</th>
                                        <th className="p-4 font-semibold">Name</th>
                                        <th className="p-4 font-semibold">Department</th>
                                        <th className="p-4 font-semibold">Salary</th>
                                        <th className="p-4 font-semibold">Risk Level</th>
                                        <th className="p-4 font-semibold text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {employees.map((emp) => (
                                        <tr key={emp.id} className={clsx("hover:bg-gray-50 transition-colors", {
                                            "bg-red-50/50": emp.risk === 'High'
                                        })}>
                                            <td className="p-4 font-medium text-gray-900">{emp.id}</td>
                                            <td className="p-4 text-gray-700">{emp.name}</td>
                                            <td className="p-4 text-gray-500">{emp.department}</td>
                                            <td className="p-4 text-gray-900 font-mono">${(emp.salary || 0).toLocaleString()}</td>
                                            <td className="p-4">
                                                <span className={clsx("inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium", {
                                                    "bg-red-100 text-red-800": emp.risk === 'High',
                                                    "bg-yellow-100 text-yellow-800": emp.risk === 'Medium',
                                                    "bg-green-100 text-green-800": emp.risk === 'Low',
                                                })}>
                                                    {emp.risk}
                                                </span>
                                            </td>
                                            <td className="p-4 text-right">
                                                <button
                                                    onClick={() => {
                                                        const empWithDetermination = { ...emp };
                                                        const riskMap = {
                                                            'Low': 'NORMAL EMPLOYEE',
                                                            'Medium': 'MEDIUM RISK ALERT',
                                                            'High': 'HIGH RISK ANOMALY',
                                                            'Critical': 'CRITICAL RISK - GHOST EMPLOYEE'
                                                        };
                                                        empWithDetermination.determination = {
                                                            classification: riskMap[emp.risk] || 'UNCLASSIFIED',
                                                            confidence: Math.round(emp.score),
                                                            reasoning: [
                                                                `Risk Level: ${emp.risk || 'Unknown'}`,
                                                                emp.daysPresent !== undefined ? `Days present: ${Math.round(emp.daysPresent)}` : null,
                                                                emp.salary ? `Salary: $${Math.round(emp.salary).toLocaleString()}` : null,
                                                                `Reconstruction error: ${emp.score}%`
                                                            ].filter(Boolean)
                                                        };
                                                        setSelectedEmployee(empWithDetermination);
                                                    }}
                                                    className="text-primary hover:text-blue-800 font-medium text-sm flex items-center justify-end gap-1 ml-auto"
                                                >
                                                    <Eye className="w-4 h-4" /> Explain
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            <AnimatePresence>
                {selectedEmployee && (
                    <DetailModal employee={selectedEmployee} onClose={() => setSelectedEmployee(null)} />
                )}
            </AnimatePresence>
        </div>
    );
};

export default Analysis;
