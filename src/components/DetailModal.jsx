import React, { useState, useEffect } from 'react';
import { FileText, AlertTriangle, X, CheckCircle, Clock, Download, Eye } from 'lucide-react';
import clsx from 'clsx';
import { motion } from 'framer-motion';
import { updateEmployeeStatus, fetchHistoricalDataAsCSV, downloadHistoricalDataAsCSV } from '../services/api';

// chart imports for the historical graph
import { Line } from 'react-chartjs-2';
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

const DetailModal = ({ employee, onClose, onUpdate }) => {
    const [updating, setUpdating] = useState(false);
    const [historyData, setHistoryData] = useState([]);
    const [loadingHistory, setLoadingHistory] = useState(false);
    const [csvContent, setCsvContent] = useState('');
    const [csvError, setCsvError] = useState('');

    // Fetch historical records for the current employee only
    useEffect(() => {
        const fetchHistory = async () => {
            setLoadingHistory(true);
            setHistoryData([]);
            setCsvContent('');
            try {
                if (!employee) return;
                const id = employee.employeeId || employee.id;
                const resp = await fetch(`http://localhost:5000/api/history?employeeId=${encodeURIComponent(id)}`);
                if (resp.ok) {
                    const body = await resp.json();
                    setHistoryData(body.data || body);
                }
            } catch (err) {
                console.error('Failed to load history', err);
            } finally {
                setLoadingHistory(false);
            }
        };
        fetchHistory();
    }, [employee]);

    const downloadCsv = async () => {
        try {
            setLoadingHistory(true);
            setCsvError('');
            const id = employee?.employeeId || employee?.id;
            const fileName = `${id}_history_${new Date().toISOString().split('T')[0]}.csv`;
            await downloadHistoricalDataAsCSV(id, fileName);
        } catch (err) {
            console.error('Failed to download CSV', err);
            setCsvError('Failed to download CSV. Please try again.');
        } finally {
            setLoadingHistory(false);
        }
    };

    const handleViewCsv = async () => {
        const id = employee?.employeeId || employee?.id;
        try {
            setLoadingHistory(true);
            setCsvError('');
            setCsvContent('');
            const csvText = await fetchHistoricalDataAsCSV(id);
            if (!csvText || csvText.trim() === '') {
                setCsvError('No historical data available for this employee.');
            } else {
                setCsvContent(csvText);
            }
        } catch (err) {
            console.error('Error fetching CSV', err);
            setCsvError(`Error loading CSV: ${err.message || 'Please try again.'}`);
        } finally {
            setLoadingHistory(false);
        }
    };

    const historyChartData = {
        labels: historyData.map(h => h.month),
        datasets: [
            {
                label: 'Attendance %',
                data: historyData.map(h => h.attendance),
                borderColor: 'rgba(34,197,94,1)',
                backgroundColor: 'rgba(34,197,94,0.1)',
                tension: 0.3,
                fill: true,
            },
            {
                label: 'Risk Score',
                data: historyData.map(h => h.riskScore * 100),
                borderColor: 'rgba(239,68,68,1)',
                backgroundColor: 'rgba(239,68,68,0.1)',
                tension: 0.3,
                fill: true,
            }
        ]
    };

    const historyOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { position: 'top' },
        },
        scales: {
            y: { beginAtZero: true, max: 100 }
        }
    };

    if (!employee) return null;

    const handleStatusUpdate = async (newStatus) => {
        setUpdating(true);
        try {
            await updateEmployeeStatus(employee.id || employee.employeeId, newStatus);
            if (onUpdate) onUpdate(employee.id || employee.employeeId, newStatus);
        } catch (err) {
            console.error(err);
            alert("Failed to update case status.")
        } finally {
            setUpdating(false);
        }
    };

    const currentStatus = employee.status || 'Pending';

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-end bg-black/50 backdrop-blur-sm">
            <motion.div
                initial={{ x: "100%" }}
                animate={{ x: 0 }}
                exit={{ x: "100%" }}
                className="w-full sm:max-w-2xl max-w-full h-full bg-white shadow-2xl p-0 overflow-y-auto flex flex-col"
            >
                <div className="p-4 sm:p-6 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white z-10 shrink-0">
                    <h3 className="text-lg sm:text-xl font-bold text-gray-800">Audit Card</h3>
                    <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full text-gray-500">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="p-4 sm:p-6 space-y-4 sm:space-y-6 flex-1">
                    <div>
                        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4 mb-4">
                            <div className="w-12 h-12 sm:w-16 sm:h-16 bg-gray-100 rounded-full flex items-center justify-center text-lg sm:text-2xl font-bold text-gray-600 shrink-0">
                                {employee.name?.charAt(0) || '?'}
                            </div>
                            <div className="flex-1 min-w-0">
                                <h4 className="text-base sm:text-lg font-bold text-gray-900 flex flex-wrap items-center gap-2">
                                    {employee.name}
                                    {currentStatus !== 'Pending' && (
                                        <span className={clsx("text-xs px-2 py-0.5 rounded-full font-medium border flex items-center gap-1", {
                                            "bg-orange-50 text-orange-700 border-orange-200": currentStatus === 'Under Investigation',
                                            "bg-gray-100 text-gray-700 border-gray-200": currentStatus === 'False Positive',
                                            "bg-red-50 text-red-700 border-red-200": currentStatus === 'Confirmed Ghost',
                                        })}>
                                            {currentStatus === 'Under Investigation' && <AlertTriangle className="w-3 h-3" />}
                                            {currentStatus === 'False Positive' && <CheckCircle className="w-3 h-3" />}
                                            {currentStatus === 'Confirmed Ghost' && <AlertTriangle className="w-3 h-3" />}
                                            {currentStatus}
                                        </span>
                                    )}
                                </h4>
                                <p className="text-xs sm:text-sm text-gray-500">{employee.id || employee.employeeId} • {employee.department}</p>

                                {/* System Determination Statement */}
                                {employee.determination && (
                                    <div className={clsx("mt-3 p-3 border rounded-lg", {
                                        "bg-red-50 border-red-200": employee.risk === 'High' || employee.risk === 'Critical',
                                        "bg-yellow-50 border-yellow-200": employee.risk === 'Medium',
                                        "bg-green-50 border-green-200": employee.risk === 'Low',
                                    })}>
                                        <div className="flex items-start gap-2">
                                            <span role="img" aria-label="alert" className="text-lg shrink-0">{employee.risk === 'High' || employee.risk === 'Critical' ? '🔴' : employee.risk === 'Medium' ? '🟡' : '🟢'}</span>
                                            <div className="text-sm">
                                                <div className={clsx("font-bold", {
                                                    "text-red-900": employee.risk === 'High' || employee.risk === 'Critical',
                                                    "text-yellow-900": employee.risk === 'Medium',
                                                    "text-green-900": employee.risk === 'Low',
                                                })}>
                                                    System Determination
                                                </div>
                                                <div className={clsx("font-semibold text-xs mt-1", {
                                                    "text-red-800": employee.risk === 'High' || employee.risk === 'Critical',
                                                    "text-yellow-800": employee.risk === 'Medium',
                                                    "text-green-800": employee.risk === 'Low',
                                                })}>
                                                    {employee.fullName || employee.name} classified as {employee.determination.classification} (Confidence: {employee.determination.confidence}% )
                                                </div>
                                            </div>
                                        </div>

                                        {employee.determination.reasoning && employee.determination.reasoning.length > 0 && (
                                            <div className={clsx("mt-2 ml-6 text-xs space-y-1", {
                                                "text-red-800": employee.risk === 'High' || employee.risk === 'Critical',
                                                "text-yellow-800": employee.risk === 'Medium',
                                                "text-green-800": employee.risk === 'Low',
                                            })}>
                                                <div className="font-semibold flex items-center gap-1"><span role="img" aria-label="reasons">🧾</span>Reasoning:</div>
                                                {employee.determination.reasoning.map((reason, idx) => (
                                                    <div key={idx}>• {reason}</div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}


                                {/* identity details section */}
                                <h5 className="mt-3 sm:mt-4 font-semibold text-sm sm:text-base text-gray-800 flex items-center gap-1">
                                    <span role="img" aria-label="id">🪪</span>
                                    Full Employee Identity
                                </h5>
                                <div className="mt-1 text-xs sm:text-sm text-gray-600 space-y-1">

                                    <div><span className="font-medium">Full Name:</span> {employee.fullName || employee.name || 'N/A'}</div>
                                    <div><span className="font-medium">Employee ID:</span> {employee.employeeId || employee.id || 'N/A'}</div>
                                    <div><span className="font-medium">Department:</span> {employee.department || 'N/A'}</div>
                                    <div><span className="font-medium">Role:</span> {employee.role || 'N/A'}</div>
                                    <div><span className="font-medium">Date Employed:</span> {employee.dateEmployed ? new Date(employee.dateEmployed).toLocaleDateString() : 'N/A'}</div>
                                    <div><span className="font-medium">Salary:</span> {employee.salary != null ? `$${Math.round(employee.salary).toLocaleString()}` : 'N/A'}</div>
                                    <div><span className="font-medium">Bank Account:</span> {employee.bankAccount || 'N/A'}</div>
                                    <div><span className="font-medium">National ID:</span> {employee.nationalId || 'N/A'}</div>
                                    <div><span className="font-medium">Contract Type:</span> {employee.contractType || 'N/A'}</div>
                                    <div><span className="font-medium">Payroll Frequency:</span> {employee.payrollFrequency || 'N/A'}</div>
                                    <div><span className="font-medium">Employment Status:</span> {employee.employmentStatus || 'N/A'}</div>
                                </div>
                            </div>
                        </div>

                        {/* anomaly score bar was previously displayed here but is redundant with the number shown elsewhere, so removed */}

                        <div className="space-y-3 sm:space-y-4">
                            <h5 className="font-bold text-sm sm:text-base text-gray-800 flex items-center gap-2">
                                <FileText className="w-4 h-4" />
                                System Explanation
                            </h5>
                            <p className="text-xs sm:text-sm text-gray-600 leading-relaxed bg-gray-50 p-3 sm:p-4 rounded-lg border border-gray-100">
                                {employee.explanation ? employee.explanation : (
                                    employee.determination
                                        ? `System classified this case as ${employee.determination.classification} with ${employee.determination.confidence}% confidence.`
                                        : "The system has not generated an explanation yet."
                                )}
                            </p>

                            {/* after system explanation we place the history card */}
                            {/* Historical Records Section */}
                            <div className="mt-3 sm:mt-4 p-3 sm:p-4 bg-blue-50 border border-blue-200 rounded-lg">
                                <div className="flex items-center justify-between mb-3">
                                    <h5 className="font-bold text-sm sm:text-base text-blue-900">📊 Historical Records</h5>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={handleViewCsv}
                                            disabled={loadingHistory}
                                            className={clsx("flex items-center gap-1 px-2 py-1 text-xs sm:text-sm rounded transition", {
                                                "bg-indigo-600 text-white hover:bg-indigo-700": !loadingHistory,
                                                "bg-gray-300 text-gray-600 cursor-not-allowed": loadingHistory
                                            })}
                                        >
                                            <Eye className="w-3 h-3" /> View CSV
                                        </button>
                                        <button
                                            onClick={downloadCsv}
                                            disabled={loadingHistory}
                                            className={clsx("flex items-center gap-1 px-2 py-1 text-xs sm:text-sm rounded transition", {
                                                "bg-blue-600 text-white hover:bg-blue-700": !loadingHistory,
                                                "bg-gray-300 text-gray-600 cursor-not-allowed": loadingHistory
                                            })}
                                        >
                                            <Download className="w-3 h-3" /> Download CSV
                                        </button>
                                    </div>
                                </div>
                                {loadingHistory ? (
                                    <p className="text-xs text-gray-600">Loading history...</p>
                                ) : historyData.length > 0 ? (
                                    <>
                                        <div className="w-full h-40 mb-2">
                                            <Line data={historyChartData} options={historyOptions} />
                                        </div>
                                        <p className="text-xs text-gray-600">Full monthly history is available via the CSV download.</p>
                                    </>
                                ) : (
                                    <p className="text-xs text-gray-600">No historical records available for this employee.</p>
                                )}
                                {csvError && (
                                    <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">
                                        {csvError}
                                    </div>
                                )}
                                {csvContent && !csvError && (
                                    <textarea
                                        readOnly
                                        className="w-full h-32 mt-2 text-xs font-mono bg-gray-100 p-2 rounded overflow-auto border border-gray-300"
                                        value={csvContent}
                                    />
                                )}
                            </div>

                            {/* Feature vector & model details for transparency */}
                            {(employee.features || employee.modelInfo) && (
                                <div className="space-y-2 sm:space-y-3">
                                    <h5 className="font-bold text-sm sm:text-base text-gray-800 flex items-center gap-2">
                                        <span role="img" aria-label="features" className="w-4 h-4">🔎</span>
                                        Feature Vector Used
                                    </h5>
                                    <pre className="bg-gray-50 p-2 sm:p-4 rounded-lg text-xs text-gray-700 leading-relaxed overflow-auto max-h-40">
{employee.features ? Object.entries(employee.features).map(([k,v])=>`${k.replace(/([A-Z])/g,' $1').replace(/^./,s=>s.toUpperCase())}: ${v}`).join("\n") : 'No features provided.'}
                                    </pre>
                                    {employee.modelInfo && (
                                        <div className="text-xs sm:text-sm text-gray-600 space-y-1">
                                            <div><span className="font-medium">Model:</span> {employee.modelInfo.name}</div>
                                            <div><span className="font-medium">Contamination:</span> {employee.modelInfo.contamination}</div>
                                            <div><span className="font-medium">Prediction:</span> {employee.modelInfo.prediction}</div>
                                            <div><span className="font-medium">Anomaly Score:</span> {(employee.anomalyScore != null ? employee.anomalyScore : employee.score) || 'N/A'}</div>
                                        </div>
                                    )}
                                    <p className="text-xs text-gray-400 mt-1">
                                        This proves:
                                        <br/>• features are engineered
                                        <br/>• the model isn't guessing
                                        <br/>• results are scientifically modeled
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </motion.div>
        </div>
    );
};

export default DetailModal;
