import React, { useState, useEffect } from 'react';
import { FileText, Calendar, Users, AlertTriangle, CheckCircle, Clock, Eye, X } from 'lucide-react';
import clsx from 'clsx';
import { motion, AnimatePresence } from 'framer-motion';
import DetailModal from '../components/DetailModal';

const Reports = () => {
    const [reports, setReports] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    // New state for viewing a specific report's full details
    const [viewingReportId, setViewingReportId] = useState(null);
    const [viewingReport, setViewingReport] = useState(null);
    const [isFetchingDetails, setIsFetchingDetails] = useState(false);
    const [selectedEmployee, setSelectedEmployee] = useState(null);

    useEffect(() => {
        const fetchReports = async () => {
            try {
                const token = localStorage.getItem('token');
                const response = await fetch("http://localhost:5000/api/reports", {
                    headers: {
                        ...(token && { "Authorization": `Bearer ${token}` })
                    }
                });
                if (!response.ok) throw new Error("Failed to fetch reports");
                const data = await response.json();
                setReports(data);
            } catch (err) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };

        fetchReports();
    }, []);

    const handleViewReport = async (id) => {
        setIsFetchingDetails(true);
        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`http://localhost:5000/api/reports/${id}`, {
                headers: {
                    ...(token && { "Authorization": `Bearer ${token}` })
                }
            });
            if (!response.ok) throw new Error("Failed to fetch report details");
            const data = await response.json();
            setViewingReport(data);
            setViewingReportId(id);
        } catch (err) {
            console.error(err);
            alert("Could not load report details.");
        } finally {
            setIsFetchingDetails(false);
        }
    };

    if (loading) {
        return (
            <div className="flex justify-center items-center h-64">
                <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="bg-red-50 text-red-700 p-4 rounded-lg flex items-center gap-2">
                <AlertTriangle className="w-5 h-5" />
                <p>Error loading reports: {error}</p>
            </div>
        );
    }

    return (
        <div className="space-y-8 relative">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Historical Reports</h1>
                    <p className="text-gray-500 mt-1">Review past anomaly detection analyses.</p>
                </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                {reports.length === 0 ? (
                    <div className="p-12 text-center flex flex-col items-center">
                        <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center text-gray-400 mb-4">
                            <Clock className="w-8 h-8" />
                        </div>
                        <h3 className="text-lg font-bold text-gray-800">No Reports Found</h3>
                        <p className="text-gray-500 mt-2">Run your first analysis on the Dashboard to see history here.</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-gray-50 border-b border-gray-200 text-xs uppercase tracking-wider text-gray-500">
                                    <th className="p-4 font-semibold">Report ID / File</th>
                                    <th className="p-4 font-semibold">Run Date</th>
                                    <th className="p-4 font-semibold text-center">Total Scanned</th>
                                    <th className="p-4 font-semibold text-center">High Risk</th>
                                    <th className="p-4 font-semibold text-center">Medium Risk</th>
                                    <th className="p-4 font-semibold text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {reports.map((report) => (
                                    <tr key={report._id} className="hover:bg-gray-50 transition-colors">
                                        <td className="p-4">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 rounded bg-blue-50 text-blue-600 flex items-center justify-center">
                                                    <FileText className="w-5 h-5" />
                                                </div>
                                                <div>
                                                    <p className="font-bold text-gray-900 text-sm max-w-[200px] truncate" title={report.reportName}>
                                                        {report.reportName}
                                                    </p>
                                                    <p className="text-xs text-gray-500 font-mono mt-0.5">{report._id.slice(-6)}</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="p-4">
                                            <div className="flex items-center gap-2 text-sm text-gray-600">
                                                <Calendar className="w-4 h-4 text-gray-400" />
                                                {new Date(report.date).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                                            </div>
                                        </td>
                                        <td className="p-4 text-center">
                                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-gray-100 text-gray-700 font-medium text-sm border border-gray-200">
                                                <Users className="w-3.5 h-3.5 text-gray-500" />
                                                {report.summary?.totalAnalyzed || 0}
                                            </span>
                                        </td>
                                        <td className="p-4 text-center">
                                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-800">
                                                {report.summary?.highRiskCount || 0}
                                            </span>
                                        </td>
                                        <td className="p-4 text-center">
                                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-yellow-100 text-yellow-800">
                                                {report.summary?.mediumRiskCount || 0}
                                            </span>
                                        </td>
                                        <td className="p-4 text-right">
                                            <button
                                                onClick={() => handleViewReport(report._id)}
                                                disabled={isFetchingDetails && viewingReportId === report._id}
                                                className="text-primary hover:text-blue-800 font-medium text-sm bg-blue-50 px-3 py-1.5 rounded-md hover:bg-blue-100 transition-colors disabled:opacity-50"
                                            >
                                                {isFetchingDetails && viewingReportId === report._id ? 'Loading...' : 'View'}
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* View Full Report Data Modal Override */}
            <AnimatePresence>
                {viewingReport && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        className="fixed inset-0 z-40 bg-gray-50 flex flex-col overflow-hidden"
                    >
                        <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between sticky top-0 z-10 w-full shadow-sm shrink-0">
                            <div>
                                <h2 className="text-xl font-bold text-gray-900">{viewingReport.reportName}</h2>
                                <p className="text-sm text-gray-500">Run on {new Date(viewingReport.date).toLocaleString()}</p>
                            </div>
                            <button
                                onClick={() => { setViewingReport(null); setViewingReportId(null); }}
                                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg flex items-center gap-2 font-medium transition-colors"
                            >
                                <X className="w-5 h-5" /> Close View
                            </button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-6 relative">
                            <div className="max-w-7xl mx-auto">
                                <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-left border-collapse">
                                            <thead>
                                                <tr className="bg-gray-50 border-b border-gray-200 text-xs uppercase tracking-wider text-gray-500">
                                                    <th className="p-4 font-semibold">ID</th>
                                                    <th className="p-4 font-semibold flex-1">Name</th>
                                                    <th className="p-4 font-semibold">Department</th>
                                                    <th className="p-4 font-semibold">Salary</th>
                                                    <th className="p-4 font-semibold">Risk Level</th>
                                                    <th className="p-4 font-semibold text-right">Actions</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-100">
                                                {(viewingReport.details || []).map((emp) => (
                                                    <tr key={emp.id} className={clsx("hover:bg-gray-50 transition-colors", {
                                                        "bg-red-50/50": emp.risk === 'High'
                                                    })}>
                                                        <td className="p-4 font-medium text-gray-900 whitespace-nowrap">{emp.id}</td>
                                                        <td className="p-4 text-gray-700 whitespace-nowrap">{emp.name}</td>
                                                        <td className="p-4 text-gray-500 whitespace-nowrap">{emp.department}</td>
                                                        <td className="p-4 text-gray-900 font-mono whitespace-nowrap">${emp.salary?.toLocaleString()}</td>
                                                        <td className="p-4 whitespace-nowrap">
                                                            <span className={clsx("inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium", {
                                                                "bg-red-100 text-red-800": emp.risk === 'High',
                                                                "bg-yellow-100 text-yellow-800": emp.risk === 'Medium',
                                                                "bg-green-100 text-green-800": emp.risk === 'Low',
                                                            })}>
                                                                {emp.risk}
                                                            </span>
                                                        </td>
                                                        <td className="p-4 text-right whitespace-nowrap">
                                                            <button
                                                                onClick={() => setSelectedEmployee(emp)}
                                                                className="text-primary hover:text-blue-800 font-medium text-sm flex items-center justify-end gap-1 ml-auto"
                                                            >
                                                                <Eye className="w-4 h-4" /> Explain
                                                            </button>
                                                        </td>
                                                    </tr>
                                                ))}
                                                {(!viewingReport.details || viewingReport.details.length === 0) && (
                                                    <tr>
                                                        <td colSpan="6" className="p-8 text-center text-gray-500">
                                                            No record details were stored for this analysis run.
                                                        </td>
                                                    </tr>
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            <AnimatePresence>
                {selectedEmployee && (
                    <DetailModal employee={selectedEmployee} onClose={() => setSelectedEmployee(null)} />
                )}
            </AnimatePresence>
        </div>
    );
};

export default Reports;
