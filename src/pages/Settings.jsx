import React, { useState } from 'react';
import {
  Shield,
  Cpu,
  SlidersHorizontal,
  Clock,
  Users,
  FileSearch
} from 'lucide-react';

const Settings = () => {
  // Model configuration
  const [anomalySensitivity, setAnomalySensitivity] = useState(50);
  const [isRetraining, setIsRetraining] = useState(false);
  const [lastRetrain, setLastRetrain] = useState('Not run yet');

  // Audit parameters
  const [salaryDeviation, setSalaryDeviation] = useState(20);
  const [maxHoursPerDay, setMaxHoursPerDay] = useState(16);
  const [checkDuplicateBank, setCheckDuplicateBank] = useState(true);
  const [checkDuplicateId, setCheckDuplicateId] = useState(true);

  // Security / RBAC
  const [sessionTimeout, setSessionTimeout] = useState(5);
  const [roleViewOnly, setRoleViewOnly] = useState('Auditor');
  const [roleCanDelete, setRoleCanDelete] = useState('Admin');

  const auditLogMock = [
    { user: 'admin@company.com', action: 'Generated Exposure Report', time: 'Today, 09:12' },
    { user: 'audit.lead@company.com', action: 'Reviewed Ghost Flagged List', time: 'Yesterday, 17:40' },
    { user: 'ciso@company.com', action: 'Updated Session Timeout Policy', time: '2 days ago, 11:03' },
  ];

  const handleRetrain = async () => {
    // Placeholder for backend integration (e.g., POST /api/model/retrain)
    setIsRetraining(true);
    try {
      await new Promise((res) => setTimeout(res, 2000));
      setLastRetrain(new Date().toLocaleString());
    } finally {
      setIsRetraining(false);
    }
  };

  return (
    <div className="space-y-8 pb-10">
      {/* Header */}
      <div className="fade-in">
        <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">
          System Settings
        </h1>
        <p className="text-gray-600">
          Configure how ghost detection, audit rules, and security controls behave across the platform.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Left column: Model & Audit parameters */}
        <div className="space-y-6 lg:col-span-2">
          {/* Model Configuration */}
          <div className="glass-card p-6">
            <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
              <Cpu className="w-5 h-5 text-purple-400" /> AI Model Configuration
            </h3>

            <div className="space-y-5">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-gray-700">
                    Anomaly Sensitivity
                  </span>
                  <span className="text-xs text-gray-500">
                    {anomalySensitivity}% &mdash;{' '}
                    {anomalySensitivity < 40 ? 'Only extreme outliers' :
                      anomalySensitivity < 70 ? 'Balanced detection' :
                        'Aggressive flagging'}
                  </span>
                </div>
                <input
                  type="range"
                  min={5}
                  max={95}
                  value={anomalySensitivity}
                  onChange={(e) => setAnomalySensitivity(Number(e.target.value))}
                  className="w-full accent-primary"
                />
                <p className="mt-1 text-xs text-gray-500">
                  Maps to Isolation Forest contamination. Lower values reduce false positives; higher values catch more edge cases.
                </p>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-white/30">
                <div className="text-xs text-gray-600">
                  <p className="font-medium text-gray-700">Model Re-training</p>
                  <p>
                    Trigger a fresh training run using the latest confirmed labels and payroll history.
                  </p>
                  <p className="mt-1 text-[0.7rem] text-gray-500">
                    Last run: <span className="font-semibold">{lastRetrain}</span>
                  </p>
                </div>
                <button
                  onClick={handleRetrain}
                  disabled={isRetraining}
                  className="px-4 py-2 rounded-xl bg-white/10 border border-white/30 text-sm font-medium text-gray-900 hover:bg-white/20 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {isRetraining ? 'Retraining model…' : 'Retrain Isolation Forest'}
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
                <label className="text-sm font-medium text-gray-700">
                  Salary Deviation Threshold (%)
                </label>
                <input
                  type="number"
                  min={1}
                  max={200}
                  value={salaryDeviation}
                  onChange={(e) => setSalaryDeviation(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-xl bg-white/60 border border-white/40 text-sm focus:outline-none focus:ring-2 focus:ring-primary/60"
                />
                <p className="text-xs text-gray-500">
                  If an employee&apos;s salary changes by more than this between periods, flag the record.
                </p>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">
                  Working Hours Cap (per day)
                </label>
                <input
                  type="number"
                  min={8}
                  max={24}
                  value={maxHoursPerDay}
                  onChange={(e) => setMaxHoursPerDay(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-xl bg-white/60 border border-white/40 text-sm focus:outline-none focus:ring-2 focus:ring-primary/60"
                />
                <p className="text-xs text-gray-500">
                  Any attendance record exceeding this threshold is treated as impossible and escalated.
                </p>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-700">
                    Duplicate Bank Accounts
                  </p>
                  <p className="text-xs text-gray-500">
                    Flag when the same IBAN / account number appears under different names.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setCheckDuplicateBank((v) => !v)}
                  className={`w-11 h-6 rounded-full flex items-center px-1 transition-all ${checkDuplicateBank ? 'bg-primary' : 'bg-gray-400/60'
                    }`}
                >
                  <div
                    className={`w-4 h-4 bg-white rounded-full shadow-sm transform transition-transform ${checkDuplicateBank ? 'translate-x-5' : ''
                      }`}
                  />
                </button>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-700">
                    Duplicate National IDs
                  </p>
                  <p className="text-xs text-gray-500">
                    Highlight cases where one ID is tied to multiple payroll records.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setCheckDuplicateId((v) => !v)}
                  className={`w-11 h-6 rounded-full flex items-center px-1 transition-all ${checkDuplicateId ? 'bg-primary' : 'bg-gray-400/60'
                    }`}
                >
                  <div
                    className={`w-4 h-4 bg-white rounded-full shadow-sm transform transition-transform ${checkDuplicateId ? 'translate-x-5' : ''
                      }`}
                  />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Right column: Security / RBAC / Audit log */}
        <div className="space-y-6">
          {/* Security Settings */}
          <div className="glass-card p-6">
            <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
              <Shield className="w-5 h-5 text-blue-400" /> Security & Access
            </h3>

            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700 flex items-center gap-2">
                  <Users className="w-4 h-4 text-blue-500" />
                  Role-Based Access
                </label>
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs text-gray-500">
                      Can view and export only
                    </span>
                    <select
                      value={roleViewOnly}
                      onChange={(e) => setRoleViewOnly(e.target.value)}
                      className="px-3 py-1.5 rounded-xl bg-white/60 border border-white/40 text-xs focus:outline-none focus:ring-2 focus:ring-primary/60"
                    >
                      <option>Auditor</option>
                      <option>Manager</option>
                      <option>Custom Role</option>
                    </select>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs text-gray-500">
                      Can delete records / override model flags
                    </span>
                    <select
                      value={roleCanDelete}
                      onChange={(e) => setRoleCanDelete(e.target.value)}
                      className="px-3 py-1.5 rounded-xl bg-white/60 border border-white/40 text-xs focus:outline-none focus:ring-2 focus:ring-primary/60"
                    >
                      <option>Admin</option>
                      <option>CISO</option>
                      <option>Custom Role</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="space-y-2 pt-2 border-t border-white/30">
                <label className="text-sm font-medium text-gray-700 flex items-center gap-2">
                  <Clock className="w-4 h-4 text-blue-500" />
                  Session Timeout
                </label>
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs text-gray-500">
                    Automatically log users out after inactivity.
                  </p>
                  <select
                    value={sessionTimeout}
                    onChange={(e) => setSessionTimeout(Number(e.target.value))}
                    className="px-3 py-1.5 rounded-xl bg-white/60 border border-white/40 text-xs focus:outline-none focus:ring-2 focus:ring-primary/60"
                  >
                    <option value={5}>5 minutes</option>
                    <option value={10}>10 minutes</option>
                    <option value={15}>15 minutes</option>
                    <option value={30}>30 minutes</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* Audit Log Snapshot */}
          <div className="glass-card p-6">
            <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
              <FileSearch className="w-5 h-5 text-emerald-400" /> Audit Log Snapshot
            </h3>
            <p className="text-xs text-gray-500 mb-3">
              Recent security-sensitive actions. For full history, export from the Reports section.
            </p>
            <div className="space-y-3 text-sm">
              {auditLogMock.map((entry, idx) => (
                <div
                  key={idx}
                  className="flex items-start justify-between gap-3 border-b border-white/20 pb-2 last:border-0 last:pb-0"
                >
                  <div>
                    <p className="font-medium text-gray-800">{entry.user}</p>
                    <p className="text-xs text-gray-500">{entry.action}</p>
                  </div>
                  <span className="text-[0.7rem] text-gray-500 whitespace-nowrap">
                    {entry.time}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Settings;

