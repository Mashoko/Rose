import React, { useState, useEffect, useCallback } from 'react';
import {
  Shield, Cpu, SlidersHorizontal, Clock, FileSearch,
  Loader2, AlertCircle, CheckCircle, Calendar, Save,
} from 'lucide-react';
import { getAuthHeaders } from '../services/api';
import { useAuth } from '../context/AuthContext';

const ML_SERVICE_URL = import.meta.env.VITE_ML_API_URL || 'http://localhost:8000';

function formatRelativeTime(dateStr) {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  return new Date(dateStr).toLocaleDateString();
}

const ACTION_LABELS = {
  LOGIN_ATTEMPT:               'Login attempt',
  REPORT_CREATED:              'Report created',
  REPORT_EXPORT:               'Report exported',
  ANOMALY_REVIEW_UPDATED:      'Case status updated',
  EMPLOYEE_FINGERPRINT_ENROLLED: 'Fingerprint enrolled',
  ATTENDANCE_SCAN_RECORDED:    'Attendance scan recorded',
  FINGERPRINT_BRIDGE_STARTED:  'Bridge started',
  FINGERPRINT_BRIDGE_STOPPED:  'Bridge stopped',
  ADMIN_BOOTSTRAPPED:          'Admin account created',
  SETTINGS_UPDATED:            'Settings updated',
  USER_CREATED:                'User account created',
  USER_UPDATED:                'User account updated',
};

// Inline toggle component
const Toggle = ({ checked, onChange }) => (
  <button
    type="button"
    onClick={() => onChange(!checked)}
    className={`w-11 h-6 rounded-full flex items-center px-1 transition-all ${checked ? 'bg-primary' : 'bg-gray-400/60'}`}
  >
    <div className={`w-4 h-4 bg-white rounded-full shadow-sm transform transition-transform ${checked ? 'translate-x-5' : ''}`} />
  </button>
);

const Settings = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'Admin';

  // ── Settings state (mirrors SystemSettings schema) ──
  const [anomalySensitivity,       setAnomalySensitivity]       = useState(50);
  const [salaryDeviation,          setSalaryDeviation]          = useState(20);
  const [maxHoursPerDay,           setMaxHoursPerDay]           = useState(16);
  const [checkDuplicateBank,       setCheckDuplicateBank]       = useState(true);
  const [checkDuplicateId,         setCheckDuplicateId]         = useState(true);
  const [sessionTimeoutMinutes,    setSessionTimeoutMinutes]    = useState(60);
  const [scheduleEnabled,          setScheduleEnabled]          = useState(false);
  const [scheduleIntervalHours,    setScheduleIntervalHours]    = useState(24);
  const [scheduleLastRunAt,        setScheduleLastRunAt]        = useState(null);

  // ── UI state ──
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [saving,          setSaving]          = useState(false);
  const [saveResult,      setSaveResult]      = useState(null); // { ok, message }

  const [isRetraining,  setIsRetraining]  = useState(false);
  const [retrainResult, setRetrainResult] = useState(null);

  const [auditLogs,        setAuditLogs]        = useState([]);
  const [auditLogsLoading, setAuditLogsLoading] = useState(true);
  const [auditLogsError,   setAuditLogsError]   = useState(null);

  // ── Load settings from backend ──
  const loadSettings = useCallback(async () => {
    setSettingsLoading(true);
    try {
      const res = await fetch('/api/settings', { headers: getAuthHeaders() });
      if (!res.ok) return;
      const data = await res.json();
      setAnomalySensitivity(data.anomalySensitivity ?? 50);
      setSalaryDeviation(data.salaryDeviationThreshold ?? 20);
      setMaxHoursPerDay(data.maxHoursPerDay ?? 16);
      setCheckDuplicateBank(data.checkDuplicateBank ?? true);
      setCheckDuplicateId(data.checkDuplicateId ?? true);
      setSessionTimeoutMinutes(data.sessionTimeoutMinutes ?? 60);
      setScheduleEnabled(data.schedule?.enabled ?? false);
      setScheduleIntervalHours(data.schedule?.intervalHours ?? 24);
      setScheduleLastRunAt(data.schedule?.lastRunAt ?? null);
    } catch {
      // non-fatal — use defaults
    } finally {
      setSettingsLoading(false);
    }
  }, []);

  useEffect(() => { loadSettings(); }, [loadSettings]);

  // ── Load audit log ──
  useEffect(() => {
    const fetchAuditLogs = async () => {
      setAuditLogsLoading(true);
      setAuditLogsError(null);
      try {
        const res = await fetch('/api/audit-logs?limit=5', { headers: getAuthHeaders() });
        if (!res.ok) {
          setAuditLogsError(res.status === 403 ? 'Audit log access requires Auditor or Admin role.' : 'Could not load audit log.');
          return;
        }
        const data = await res.json();
        setAuditLogs(data.data || []);
      } catch {
        setAuditLogsError('Could not connect to the server.');
      } finally {
        setAuditLogsLoading(false);
      }
    };
    fetchAuditLogs();
  }, []);

  // ── Save settings ──
  const handleSaveSettings = async () => {
    if (!isAdmin) return;
    setSaving(true);
    setSaveResult(null);
    try {
      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({
          anomalySensitivity,
          salaryDeviationThreshold: salaryDeviation,
          maxHoursPerDay,
          checkDuplicateBank,
          checkDuplicateId,
          sessionTimeoutMinutes,
          schedule: { enabled: scheduleEnabled, intervalHours: scheduleIntervalHours },
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      setSaveResult({ ok: true, message: 'Settings saved successfully.' });
    } catch (err) {
      setSaveResult({ ok: false, message: err.message });
    } finally {
      setSaving(false);
    }
  };

  // ── Retrain model ──
  const handleRetrain = async () => {
    setIsRetraining(true);
    setRetrainResult(null);
    try {
      const res = await fetch(`${ML_SERVICE_URL}/retrain`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contamination: anomalySensitivity / 100 }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || body.error || `ML service returned HTTP ${res.status}`);
      }
      setRetrainResult({ ok: true, message: 'Model retrained successfully.', timestamp: new Date().toLocaleString() });
    } catch (err) {
      setRetrainResult({ ok: false, message: err.message || 'Retraining failed. Ensure the ML service is running.' });
    } finally {
      setIsRetraining(false);
    }
  };

  const fieldClass = 'w-full px-3 py-2 rounded-xl bg-white/60 border border-white/40 text-sm focus:outline-none focus:ring-2 focus:ring-primary/60 disabled:opacity-60 disabled:cursor-not-allowed';

  return (
    <div className="space-y-8 pb-10">
      {/* Header */}
      <div className="fade-in flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">System Settings</h1>
          <p className="text-gray-600">Configure ghost detection, audit rules, and security controls.</p>
        </div>
        {isAdmin && (
          <button
            onClick={handleSaveSettings}
            disabled={saving || settingsLoading}
            className="flex items-center gap-2 px-5 py-2.5 bg-primary hover:bg-blue-700 text-white text-sm font-medium rounded-xl transition-all shadow-sm disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saving ? 'Saving…' : 'Save Settings'}
          </button>
        )}
      </div>

      {/* Save result banner */}
      {saveResult && (
        <div className={`flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium border ${saveResult.ok ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-red-50 text-red-800 border-red-200'}`}>
          {saveResult.ok ? <CheckCircle className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
          {saveResult.message}
        </div>
      )}

      {!isAdmin && (
        <div className="flex items-start gap-2 px-4 py-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-sm">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>Settings are view-only for your role. Contact an Admin to make changes.</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Left column */}
        <div className="space-y-6 lg:col-span-2">
          {/* Model Configuration */}
          <div className="glass-card p-6">
            <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
              <Cpu className="w-5 h-5 text-purple-400" /> AI Model Configuration
            </h3>
            <div className="space-y-5">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-gray-700">Anomaly Sensitivity</span>
                  <span className="text-xs text-gray-500">
                    {anomalySensitivity}% &mdash;{' '}
                    {anomalySensitivity < 40 ? 'Only extreme outliers' : anomalySensitivity < 70 ? 'Balanced detection' : 'Aggressive flagging'}
                  </span>
                </div>
                <input
                  type="range" min={5} max={95}
                  value={anomalySensitivity}
                  onChange={(e) => setAnomalySensitivity(Number(e.target.value))}
                  disabled={!isAdmin}
                  className="w-full accent-primary disabled:opacity-60"
                />
                <p className="mt-1 text-xs text-gray-500">Maps to Isolation Forest contamination.</p>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-white/30">
                <div className="text-xs text-gray-600 flex-1">
                  <p className="font-medium text-gray-700">Model Re-training</p>
                  <p>Trigger a fresh training run with the latest confirmed labels.</p>
                  {retrainResult && (
                    <p className={`mt-1 font-semibold ${retrainResult.ok ? 'text-emerald-600' : 'text-red-600'}`}>
                      {retrainResult.ok ? `Last run: ${retrainResult.timestamp}` : `Error: ${retrainResult.message}`}
                    </p>
                  )}
                  {!retrainResult && <p className="mt-1 text-[0.7rem] text-gray-400">Not run this session.</p>}
                </div>
                <button
                  onClick={handleRetrain}
                  disabled={isRetraining}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white/10 border border-white/30 text-sm font-medium text-gray-900 hover:bg-white/20 transition-all disabled:opacity-60"
                >
                  {isRetraining && <Loader2 className="w-4 h-4 animate-spin" />}
                  {isRetraining ? 'Retraining…' : 'Retrain Isolation Forest'}
                </button>
              </div>
            </div>
          </div>

          {/* Audit Parameters */}
          <div className="glass-card p-6">
            <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
              <SlidersHorizontal className="w-5 h-5 text-blue-400" /> Audit Parameters
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">Salary Deviation Threshold (%)</label>
                <input type="number" min={1} max={200} value={salaryDeviation} disabled={!isAdmin}
                  onChange={(e) => setSalaryDeviation(Number(e.target.value))} className={fieldClass} />
                <p className="text-xs text-gray-500">Flag salary changes exceeding this percentage.</p>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">Working Hours Cap (per day)</label>
                <input type="number" min={8} max={24} value={maxHoursPerDay} disabled={!isAdmin}
                  onChange={(e) => setMaxHoursPerDay(Number(e.target.value))} className={fieldClass} />
                <p className="text-xs text-gray-500">Attendance records exceeding this are escalated.</p>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-700">Duplicate Bank Accounts</p>
                  <p className="text-xs text-gray-500">Flag same IBAN under different names.</p>
                </div>
                <Toggle checked={checkDuplicateBank} onChange={isAdmin ? setCheckDuplicateBank : () => {}} />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-700">Duplicate National IDs</p>
                  <p className="text-xs text-gray-500">Highlight one ID tied to multiple records.</p>
                </div>
                <Toggle checked={checkDuplicateId} onChange={isAdmin ? setCheckDuplicateId : () => {}} />
              </div>
            </div>
          </div>

          {/* Scheduled Analysis */}
          <div className="glass-card p-6">
            <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
              <Calendar className="w-5 h-5 text-emerald-400" /> Scheduled Analysis
            </h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-700">Enable Automatic Analysis</p>
                  <p className="text-xs text-gray-500">Server runs a full ML scan at the configured interval.</p>
                </div>
                <Toggle checked={scheduleEnabled} onChange={isAdmin ? setScheduleEnabled : () => {}} />
              </div>
              {scheduleEnabled && (
                <div className="space-y-2 pl-0">
                  <label className="text-sm font-medium text-gray-700">Interval (hours)</label>
                  <input
                    type="number" min={1} max={168}
                    value={scheduleIntervalHours}
                    disabled={!isAdmin}
                    onChange={(e) => setScheduleIntervalHours(Number(e.target.value))}
                    className={`${fieldClass} max-w-[160px]`}
                  />
                  <p className="text-xs text-gray-500">
                    Runs every {scheduleIntervalHours}h.
                    {scheduleLastRunAt
                      ? ` Last run: ${new Date(scheduleLastRunAt).toLocaleString()}.`
                      : ' Not yet run.'}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right column */}
        <div className="space-y-6">
          {/* Security Settings */}
          <div className="glass-card p-6">
            <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
              <Shield className="w-5 h-5 text-blue-400" /> Security & Access
            </h3>
            <div className="space-y-4">
              <div className="space-y-2 pt-2 border-t border-white/30">
                <label className="text-sm font-medium text-gray-700 flex items-center gap-2">
                  <Clock className="w-4 h-4 text-blue-500" /> Session Timeout
                </label>
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs text-gray-500">Automatically log out after inactivity.</p>
                  <select
                    value={sessionTimeoutMinutes}
                    onChange={(e) => setSessionTimeoutMinutes(Number(e.target.value))}
                    disabled={!isAdmin}
                    className="px-3 py-1.5 rounded-xl bg-white/60 border border-white/40 text-xs focus:outline-none focus:ring-2 focus:ring-primary/60 disabled:opacity-60"
                  >
                    <option value={15}>15 minutes</option>
                    <option value={30}>30 minutes</option>
                    <option value={60}>60 minutes</option>
                    <option value={120}>2 hours</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* Audit Log Snapshot */}
          <div className="glass-card p-6">
            <h3 className="text-lg font-bold mb-1 flex items-center gap-2">
              <FileSearch className="w-5 h-5 text-emerald-400" /> Audit Log Snapshot
            </h3>
            <p className="text-xs text-gray-500 mb-3">5 most recent security-sensitive actions.</p>

            {auditLogsLoading && (
              <div className="flex items-center gap-2 text-sm text-gray-500 py-4">
                <Loader2 className="w-4 h-4 animate-spin" /> Loading…
              </div>
            )}
            {auditLogsError && (
              <div className="flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" /> {auditLogsError}
              </div>
            )}
            {!auditLogsLoading && !auditLogsError && auditLogs.length === 0 && (
              <p className="text-sm text-gray-400 py-4 text-center">No audit events yet.</p>
            )}
            {!auditLogsLoading && !auditLogsError && auditLogs.length > 0 && (
              <div className="space-y-3 text-sm">
                {auditLogs.map((entry) => (
                  <div key={entry._id} className="flex items-start justify-between gap-3 border-b border-white/20 pb-2 last:border-0 last:pb-0">
                    <div className="min-w-0">
                      <p className="font-medium text-gray-800 truncate">{entry.actorUsername || 'System'}</p>
                      <p className="text-xs text-gray-500">
                        {ACTION_LABELS[entry.action] || entry.action}
                        {entry.status === 'failure' && <span className="ml-1 text-red-500 font-semibold">(failed)</span>}
                      </p>
                    </div>
                    <span className="text-[0.7rem] text-gray-400 whitespace-nowrap shrink-0">
                      {formatRelativeTime(entry.createdAt)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Settings;
