import React, { useState, useEffect } from 'react';
import { AlertTriangle, X, CheckCircle, Download, Eye } from 'lucide-react';
import clsx from 'clsx';
import { motion as Motion } from 'framer-motion';
import { fetchHistoricalDataAsCSV, downloadHistoricalDataAsCSV, getAuthHeaders } from '../services/api';
import SHAPExplanation from './SHAPExplanation';
import { Line } from 'react-chartjs-2';
import {
    Chart as ChartJS, CategoryScale, LinearScale,
    PointElement, LineElement, Title, Tooltip, Legend
} from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend);

// Derive risk level purely from the 0–100 score so it's always consistent
function riskFromScore(score) {
    const s = Math.min(100, Math.max(0, Number(score) || 0));
    if (s >= 70) return 'High';
    if (s >= 40) return 'Medium';
    return 'Low';
}

const STATUS_STYLES = {
    'Under Investigation': 'bg-orange-50 text-orange-700 border-orange-200',
    'False Positive':      'bg-gray-100  text-gray-700  border-gray-200',
    'Confirmed Ghost':     'bg-red-50    text-red-700   border-red-200',
};

// Only render a row if the value exists and isn't a placeholder
const IdentityRow = ({ label, value }) => {
    if (value == null || value === '' || value === 'N/A') return null;
    return (
        <div className="flex gap-2 text-sm">
            <span className="font-medium text-gray-500 shrink-0 w-36">{label}</span>
            <span className="text-gray-800">{value}</span>
        </div>
    );
};

const DetailModal = ({ employee, onClose }) => {
    const [historyData,   setHistoryData]   = useState([]);
    const [loadingHist,   setLoadingHist]   = useState(false);
    const [csvContent,    setCsvContent]    = useState('');
    const [csvError,      setCsvError]      = useState('');

    useEffect(() => {
        if (!employee) return;
        const id = employee.employeeId || employee.id;
        if (!id) return;
        setLoadingHist(true);
        fetch(`/api/history?employeeId=${encodeURIComponent(id)}`, { headers: getAuthHeaders() })
            .then(r => r.ok ? r.json() : { data: [] })
            .then(body => setHistoryData(body.data || body || []))
            .catch(() => {})
            .finally(() => setLoadingHist(false));
    }, [employee]);

    const handleViewCsv = async () => {
        const id = employee?.employeeId || employee?.id;
        setLoadingHist(true); setCsvError(''); setCsvContent('');
        try {
            const text = await fetchHistoricalDataAsCSV(id);
            text?.trim() ? setCsvContent(text) : setCsvError('No historical data available.');
        } catch (e) {
            setCsvError('Failed to load CSV.');
        } finally {
            setLoadingHist(false);
        }
    };

    const handleDownloadCsv = async () => {
        const id = employee?.employeeId || employee?.id;
        setLoadingHist(true); setCsvError('');
        try {
            await downloadHistoricalDataAsCSV(id, `${id}_history.csv`);
        } catch {
            setCsvError('Download failed.');
        } finally {
            setLoadingHist(false);
        }
    };

    if (!employee) return null;

    const name       = employee.fullName || employee.name || 'Unknown';
    const empId      = employee.employeeId || employee.id || '—';
    const dept       = employee.department || '—';
    const initials   = name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
    const status     = employee.status;

    // Derive risk level from score — single source of truth
    const rawScore   = Number(employee.anomalyScore ?? employee.Reconstruction_Error ?? employee.score ?? 0);
    const normScore  = rawScore <= 1 && rawScore > 0 ? rawScore * 100 : rawScore;
    const riskLevel  = riskFromScore(normScore);

    const riskColor  = riskLevel === 'High' ? 'text-red-700' : riskLevel === 'Medium' ? 'text-amber-700' : 'text-emerald-700';
    const riskBg     = riskLevel === 'High' ? 'bg-red-50 border-red-200' : riskLevel === 'Medium' ? 'bg-amber-50 border-amber-200' : 'bg-emerald-50 border-emerald-200';

    // Build a normalised employee object for SHAPExplanation with consistent risk
    const empForShap = { ...employee, riskLevel, risk: riskLevel, anomalyScore: normScore };

    const histChartData = {
        labels: historyData.map(h => h.month),
        datasets: [
            { label: 'Attendance', data: historyData.map(h => h.attendance), borderColor: '#22c55e', backgroundColor: 'rgba(34,197,94,0.08)', tension: 0.3, fill: true },
            { label: 'Risk Score', data: historyData.map(h => (h.riskScore || 0) * 100), borderColor: '#ef4444', backgroundColor: 'rgba(239,68,68,0.08)', tension: 0.3, fill: true },
        ],
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-end bg-black/50 backdrop-blur-sm">
            <Motion.div
                initial={{ x: '100%' }}
                animate={{ x: 0 }}
                exit={{ x: '100%' }}
                className="w-full sm:max-w-2xl h-full bg-white shadow-2xl flex flex-col overflow-hidden"
            >
                {/* ── Sticky header ── */}
                <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between shrink-0 bg-white sticky top-0 z-10">
                    <div>
                        <h3 className="text-lg font-bold text-gray-900">Audit Card</h3>
                        <p className="text-xs text-gray-400 mt-0.5">{empId} · {dept}</p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full text-gray-500">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">

                    {/* ── 1. Employee identity ── */}
                    <div className="flex items-center gap-4">
                        <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center text-xl font-bold text-primary shrink-0">
                            {initials}
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                                <h4 className="text-lg font-bold text-gray-900">{name}</h4>
                                {/* Score-derived risk badge */}
                                <span className={clsx('text-xs font-semibold px-2 py-0.5 rounded-full border', riskBg, riskColor)}>
                                    {riskLevel} Risk
                                </span>
                                {/* Audit status badge (only if set) */}
                                {status && status !== 'Pending' && (
                                    <span className={clsx('text-xs px-2 py-0.5 rounded-full border flex items-center gap-1', STATUS_STYLES[status] || 'bg-gray-100 text-gray-600 border-gray-200')}>
                                        {status === 'Under Investigation' && <AlertTriangle className="w-3 h-3" />}
                                        {status === 'False Positive'      && <CheckCircle  className="w-3 h-3" />}
                                        {status === 'Confirmed Ghost'     && <AlertTriangle className="w-3 h-3" />}
                                        {status}
                                    </span>
                                )}
                            </div>
                            <p className="text-sm text-gray-500 mt-0.5">{dept}</p>
                        </div>
                    </div>

                    {/* ── 2. ML Score + explanation (single authoritative section) ── */}
                    <div className="rounded-xl border border-gray-200 p-4 bg-gray-50">
                        <SHAPExplanation employee={empForShap} />
                    </div>

                    {/* ── 3. Employee profile details (skip N/A fields) ── */}
                    <div>
                        <h5 className="text-sm font-bold text-gray-700 mb-3 uppercase tracking-wide">Employee Profile</h5>
                        <div className="space-y-2 bg-white border border-gray-100 rounded-xl p-4">
                            <IdentityRow label="Full Name"          value={name} />
                            <IdentityRow label="Employee ID"        value={empId} />
                            <IdentityRow label="Department"         value={dept} />
                            <IdentityRow label="Role"               value={employee.role} />
                            <IdentityRow label="Contract Type"      value={employee.contractType} />
                            <IdentityRow label="Employment Status"  value={employee.employmentStatus} />
                            <IdentityRow label="Date Employed"      value={employee.dateEmployed ? new Date(employee.dateEmployed).toLocaleDateString() : null} />
                            <IdentityRow label="Salary"             value={employee.salary != null ? `$${Math.round(employee.salary).toLocaleString()}` : null} />
                            <IdentityRow label="Attendance Days"    value={employee.attendanceDays != null ? `${employee.attendanceDays} / 22 days` : null} />
                            <IdentityRow label="National ID"        value={employee.nationalId} />
                            <IdentityRow label="Bank Account"       value={employee.bankAccount} />
                            <IdentityRow label="Payroll Frequency"  value={employee.payrollFrequency} />
                            <IdentityRow label="Email"              value={employee.email} />
                        </div>
                    </div>

                    {/* ── 4. Historical records ── */}
                    <div>
                        <div className="flex items-center justify-between mb-3">
                            <h5 className="text-sm font-bold text-gray-700 uppercase tracking-wide">Historical Records</h5>
                            <div className="flex gap-2">
                                <button
                                    onClick={handleViewCsv}
                                    disabled={loadingHist}
                                    className="flex items-center gap-1 px-3 py-1.5 text-xs rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
                                >
                                    <Eye className="w-3 h-3" /> View CSV
                                </button>
                                <button
                                    onClick={handleDownloadCsv}
                                    disabled={loadingHist}
                                    className="flex items-center gap-1 px-3 py-1.5 text-xs rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
                                >
                                    <Download className="w-3 h-3" /> Download CSV
                                </button>
                            </div>
                        </div>

                        <div className="bg-white border border-gray-100 rounded-xl p-4">
                            {loadingHist ? (
                                <p className="text-xs text-gray-400 text-center py-4">Loading history…</p>
                            ) : historyData.length > 0 ? (
                                <div className="h-40">
                                    <Line data={histChartData} options={{
                                        responsive: true, maintainAspectRatio: false,
                                        plugins: { legend: { position: 'top' } },
                                        scales: { y: { beginAtZero: true, max: 100 } }
                                    }} />
                                </div>
                            ) : (
                                <p className="text-xs text-gray-400 text-center py-4">No historical records for this employee.</p>
                            )}

                            {csvError && (
                                <p className="mt-2 text-xs text-red-600 bg-red-50 border border-red-100 rounded px-3 py-2">{csvError}</p>
                            )}
                            {csvContent && !csvError && (
                                <textarea
                                    readOnly
                                    className="w-full h-32 mt-3 text-xs font-mono bg-gray-50 border border-gray-200 rounded p-2 resize-none"
                                    value={csvContent}
                                />
                            )}
                        </div>
                    </div>

                </div>
            </Motion.div>
        </div>
    );
};

export default DetailModal;
