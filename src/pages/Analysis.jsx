import React, { useState } from 'react';
import { UploadCloud, FileText, CheckCircle, AlertTriangle, Eye, X } from 'lucide-react';
import clsx from 'clsx';
import { motion, AnimatePresence } from 'framer-motion';
import ScatterPlot from '../components/ScatterPlot';

// Detail Modal Component (Inline for simplicity, can be separated)
const DetailModal = ({ employee, onClose }) => {
    if (!employee) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-end bg-black/50 backdrop-blur-sm">
            <motion.div
                initial={{ x: "100%" }}
                animate={{ x: 0 }}
                exit={{ x: "100%" }}
                className="w-full max-w-md h-full bg-white shadow-2xl p-0 overflow-y-auto"
            >
                <div className="p-6 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white z-10">
                    <h3 className="text-xl font-bold text-gray-800">Audit Card</h3>
                    <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full text-gray-500">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="p-6 space-y-6">
                    <div>
                        <div className="flex items-center gap-4 mb-4">
                            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center text-2xl font-bold text-gray-600">
                                {employee.name.charAt(0)}
                            </div>
                            <div>
                                <h4 className="text-lg font-bold text-gray-900">{employee.name}</h4>
                                <p className="text-sm text-gray-500">{employee.id} • {employee.department}</p>
                            </div>
                        </div>

                        <div className={clsx("p-4 rounded-xl border mb-6", {
                            "bg-red-50 border-red-100 text-red-900": employee.risk === 'High',
                            "bg-yellow-50 border-yellow-100 text-yellow-900": employee.risk === 'Medium',
                            "bg-green-50 border-green-100 text-green-900": employee.risk === 'Low',
                        })}>
                            <div className="flex items-center justify-between mb-2">
                                <span className="font-bold text-sm uppercase tracking-wide">Anomaly Score</span>
                                <span className="text-2xl font-bold">{employee.score}%</span>
                            </div>
                            <div className="w-full bg-white/50 h-2 rounded-full overflow-hidden">
                                <div className="h-full bg-current" style={{ width: `${employee.score}%` }}></div>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <h5 className="font-bold text-gray-800 flex items-center gap-2">
                                <FileText className="w-4 h-4" />
                                System Explanation
                            </h5>
                            <p className="text-gray-600 text-sm leading-relaxed bg-gray-50 p-4 rounded-lg border border-gray-100">
                                {employee.explanation}
                            </p>
                        </div>
                    </div>

                    <div className="border-t border-gray-100 pt-6 space-y-3">
                        <button className="w-full py-3 bg-red-600 hover:bg-red-700 text-white font-medium rounded-lg shadow-sm transition-colors flex items-center justify-center gap-2">
                            <AlertTriangle className="w-4 h-4" />
                            Confirm for Investigation
                        </button>
                        <button className="w-full py-3 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 font-medium rounded-lg transition-colors">
                            Mark as False Positive
                        </button>
                    </div>
                </div>
            </motion.div>
        </div>
    );
};

const Analysis = () => {
    const [step, setStep] = useState(1); // 1: Upload, 2: Processing, 3: Results
    const [selectedEmployee, setSelectedEmployee] = useState(null);
    const [employees, setAnalysisResults] = useState([]);
    const [scatterData, setScatterData] = useState(null);

    const saveReportToDatabase = async (mappedData, filename) => {
        try {
            const sum = {
                totalAnalyzed: mappedData.length,
                highRiskCount: mappedData.filter(e => e.risk === 'High').length,
                mediumRiskCount: mappedData.filter(e => e.risk === 'Medium').length,
                lowRiskCount: mappedData.filter(e => e.risk === 'Low').length,
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

    const handleUpload = async (event) => {
        const file = event.target.files?.[0];
        if (!file) return;

        setStep(2);

        const formData = new FormData();
        formData.append("file", file);

        try {
            const response = await fetch("http://localhost:8000/analyze", {
                method: "POST",
                body: formData,
            });

            const result = await response.json();

            if (result.status === "success") {
                const mappedData = result.data.map(item => ({
                    id: item.id || item.Employee_ID || `EMP-${Math.floor(Math.random() * 10000)}`,
                    name: item.Name || item.fullName || "Unknown Employee",
                    department: item.Department || item.department || "Unknown",
                    salary: item.Monthly_Salary,
                    daysPresent: item.Days_Present,
                    risk: item.Risk_Level,
                    score: Math.round(item.Reconstruction_Error * 100),
                    explanation: item.explanation
                }));

                setAnalysisResults(mappedData);

                // Prepare Chart.js Data
                const normalPoints = mappedData.filter(e => e.risk === 'Low').map(e => ({ x: e.daysPresent, y: e.salary, id: e.id }));
                const mediumPoints = mappedData.filter(e => e.risk === 'Medium').map(e => ({ x: e.daysPresent, y: e.salary, id: e.id }));
                const highPoints = mappedData.filter(e => e.risk === 'High').map(e => ({ x: e.daysPresent, y: e.salary, id: e.id }));

                setScatterData({
                    datasets: [
                        {
                            label: 'Normal (Low Risk)',
                            data: normalPoints,
                            backgroundColor: 'rgba(34, 197, 94, 0.6)', // Green
                            borderColor: 'rgba(34, 197, 94, 1)',
                            pointRadius: 4,
                        },
                        {
                            label: 'Suspicious (Medium Risk)',
                            data: mediumPoints,
                            backgroundColor: 'rgba(234, 179, 8, 0.8)', // Yellow
                            borderColor: 'rgba(234, 179, 8, 1)',
                            pointRadius: 6,
                        },
                        {
                            label: 'Anomalies (High Risk)',
                            data: highPoints,
                            backgroundColor: 'rgba(239, 68, 68, 1)', // Red
                            borderColor: 'rgba(220, 38, 38, 1)',
                            pointRadius: 8,
                        }
                    ]
                });

                // Auto-save the results to our MongoDB Database via Node/Express Backend
                saveReportToDatabase(mappedData, file.name);

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
                    <button onClick={() => setStep(1)} className="text-sm text-primary hover:underline">
                        Start New Analysis
                    </button>
                )}
            </div>

            {/* Step 1: Upload */}
            {step === 1 && (
                <div className="bg-white border-2 border-dashed border-gray-300 rounded-2xl p-12 flex flex-col items-center justify-center text-center hover:border-primary transition-colors cursor-pointer group relative">
                    <input
                        type="file"
                        accept=".csv"
                        onChange={handleUpload}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    />
                    <div className="w-16 h-16 bg-blue-50 text-primary rounded-full flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                        <UploadCloud className="w-8 h-8" />
                    </div>
                    <h3 className="text-xl font-bold text-gray-800 mb-2">Upload Payroll & Attendance Data</h3>
                    <p className="text-gray-500 max-w-sm">
                        Drag and drop your Excel/CSV files here, or click to browse.
                        Supported: .csv, .xlsx
                    </p>
                </div>
            )}

            {/* Step 2: Processing */}
            {step === 2 && (
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
                    <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-6"></div>
                    <h3 className="text-lg font-bold text-gray-800">Processing Data...</h3>
                    <p className="text-gray-500 mb-6">Running Isolation Forest Model for anomaly detection.</p>

                    <div className="max-w-md mx-auto space-y-3 text-sm text-left">
                        <div className="flex items-center gap-3 text-green-600">
                            <CheckCircle className="w-4 h-4" /> Validating File Structure
                        </div>
                        <div className="flex items-center gap-3 text-green-600">
                            <CheckCircle className="w-4 h-4" /> Extracting Advanced Features
                        </div>
                        <div className="flex items-center gap-3 text-primary animate-pulse">
                            <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin"></div>
                            Identifying Ghost Outliers
                        </div>
                    </div>
                </div>
            )}

            {/* Step 3: Results Dashboard */}
            {step === 3 && (
                <div className="space-y-6">
                    {/* Visual Analytics */}
                    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                        <h3 className="text-lg font-bold text-gray-800 mb-4">Risk Visualization (Days Present vs. Monthly Salary)</h3>
                        {scatterData && <ScatterPlot data={scatterData} />}
                    </div>

                    {/* Data Grid */}
                    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
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
                                            <td className="p-4 text-gray-900 font-mono">${emp.salary.toLocaleString()}</td>
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
                                                    onClick={() => setSelectedEmployee(emp)}
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
