import React, { useState } from 'react';
import { UploadCloud, FileText, CheckCircle, AlertTriangle, Eye, X } from 'lucide-react';
import clsx from 'clsx';
import { motion, AnimatePresence } from 'framer-motion';
import ScatterPlot from '../components/ScatterPlot';
import DetailModal from '../components/DetailModal';

const Analysis = () => {
    const [step, setStep] = useState(1); // 1: Upload, 2: Processing, 3: Results
    const [selectedEmployee, setSelectedEmployee] = useState(null);
    const [employees, setAnalysisResults] = useState([]);
    const [scatterData, setScatterData] = useState(null);
    const [payrollFile, setPayrollFile] = useState(null);
    const [attendanceFile, setAttendanceFile] = useState(null);

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
                    salary: item.salary || item.Monthly_Salary || 0,
                    daysPresent: item.attendanceDays || item.Days_Present || 20,
                    risk: item.Risk_Level || item.riskLevel || 'Low',
                    score: item.Reconstruction_Error ? Math.round(item.Reconstruction_Error * 100) : 0,
                    explanation: item.explanation || "No explanation available"
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
