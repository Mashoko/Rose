import React, { useState, useEffect } from 'react';
import { FileText, Calendar, Users, AlertTriangle, CheckCircle, Clock } from 'lucide-react';
import clsx from 'clsx';
import { motion, AnimatePresence } from 'framer-motion';

const Reports = () => {
    const [reports, setReports] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

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
        <div className="space-y-8">
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
                                            <button className="text-primary hover:text-blue-800 font-medium text-sm bg-blue-50 px-3 py-1.5 rounded-md hover:bg-blue-100 transition-colors">
                                                View
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
};

export default Reports;
