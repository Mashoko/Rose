import React, { useCallback, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import {
  FingerprintPattern, RefreshCw, AlertCircle, UserPlus, X,
  CheckCircle2, Usb, Database, Search, Shield, Clock, Activity,
} from 'lucide-react';
import clsx from 'clsx';
import { isWebSerialSupported, enrollFingerprintViaPicoSerial } from '../lib/picoSerialEnroll';
import { requestBridgeStop, requestBridgeStart } from '../lib/bridgeControl';
import { getAuthHeaders } from '../services/api';

const SLOT_MIN = 0;
const SLOT_MAX = 162;

const RISK_COLORS = {
  High:     'bg-red-100 text-red-800',
  Critical: 'bg-red-100 text-red-800',
  Medium:   'bg-yellow-100 text-yellow-800',
  Low:      'bg-green-100 text-green-800',
};

const DEPARTMENTS = [
  'Administration', 'Finance', 'Human Resources', 'Information Technology',
  'Academic Affairs', 'Research', 'Library', 'Student Affairs',
  'Facilities', 'Security', 'Health Services', 'Legal',
];

function genEmpId() {
  return 'EMP-' + Math.floor(10000 + Math.random() * 90000);
}

const ENROLL_STEPS = ['Connect', 'Scan 1', 'Scan 2', 'Done'];
function phaseToStep(p) {
  if (!p || p === 'connecting' || p === 'ready') return 0;
  if (p === 'scan1') return 1;
  if (p === 'remove' || p === 'scan2') return 2;
  if (p === 'success') return 3;
  return -1;
}

// ─── Enroll modal ─────────────────────────────────────────────────────────────
const EnrollModal = ({ onClose, onEnrolled }) => {
  const [tab,          setTab]          = useState('database');
  const [empMode,      setEmpMode]      = useState('search');
  const [search,       setSearch]       = useState('');
  const [allEmployees, setAllEmployees] = useState([]);
  const [filtered,     setFiltered]     = useState([]);
  const [selected,     setSelected]     = useState(null);
  const [slot,         setSlot]         = useState('');
  const [saving,       setSaving]       = useState(false);
  const [creating,     setCreating]     = useState(false);
  const [error,        setError]        = useState('');
  const [capturing,    setCapturing]    = useState(false);
  const [capturePhase, setCapturePhase] = useState(null);
  const [captureError, setCaptureError] = useState('');
  const [newEmp,       setNewEmp]       = useState({
    fullName: '', department: '', employeeId: genEmpId(),
    email: '', salary: '', nationalId: '', contractType: 'Full-Time',
  });
  const abortRef     = useRef(null);
  const scanStarted  = useRef(false);
  const webSerialOk = isWebSerialSupported();
  const busy = saving || capturing || creating;

  useEffect(() => {
    fetch('/api/employees', { headers: getAuthHeaders() })
      .then(r => r.json())
      .then(data => {
        const list = Array.isArray(data) ? data : (data.data || []);
        setAllEmployees(list);
        setFiltered(list);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const q = search.toLowerCase();
    setFiltered(
      q ? allEmployees.filter(e =>
            (e.fullName || '').toLowerCase().includes(q) ||
            (e.employeeId || '').toLowerCase().includes(q) ||
            (e.department || '').toLowerCase().includes(q))
        : allEmployees
    );
  }, [search, allEmployees]);

  // ── Phase tracking ────────────────────────────────────────────────────────────
  // flushSync forces an immediate DOM paint for each phase so the user sees
  // "Place finger" before the sensor moves on — without it React batches
  // multiple serial lines into one render and the prompts flash by invisibly.
  const updateCapturePhase = line => {
    const l = line.toLowerCase();
    if (l.includes('port open') || l.includes('paused bridge'))
      flushSync(() => setCapturePhase('connecting'));
    else if (l.startsWith('sent enroll') || l.includes('follow prompts'))
      flushSync(() => setCapturePhase('ready'));
    else if (l.includes('[scan 1/2]'))
      flushSync(() => { scanStarted.current = true; setCapturePhase('scan1'); });
    else if (l.includes('remove finger'))
      flushSync(() => setCapturePhase('remove'));
    else if (l.includes('[scan 2/2]'))
      flushSync(() => setCapturePhase('scan2'));
    else if (l.startsWith('enroll_success'))
      flushSync(() => setCapturePhase('success'));
    else if (l.startsWith('error:') || l.includes('failed') || l.includes('did not match'))
      flushSync(() => {
        setCaptureError(line.replace(/^error:/i, '').trim() || line);
        setCapturePhase('error');
      });
  };
  const appendLog = line => updateCapturePhase(line);

  const handleNewEmpChange = e => setNewEmp(p => ({ ...p, [e.target.name]: e.target.value }));

  // ── Core sensor-capture routine ───────────────────────────────────────────────
  const runCapture = async (emp, fpId) => {
    setCapturePhase(null);
    setCaptureError('');
    scanStarted.current = false;
    const ac = new AbortController();
    abortRef.current = ac;
    setCapturing(true);
    let bridgeStopped = false;
    try {
      const stopRes = await requestBridgeStop();
      if (stopRes.ok) {
        bridgeStopped = true;
        appendLog('Paused bridge.py — this tab now owns the serial port.');
        await new Promise(r => setTimeout(r, 400));
      } else {
        appendLog(`Bridge pause: ${stopRes.error || 'skipped'}`);
      }
      await enrollFingerprintViaPicoSerial({ employeeId: emp.employeeId, slot: fpId, signal: ac.signal, onLog: appendLog });
      if (!scanStarted.current) {
        throw new Error('No physical finger scan was detected — the sensor may have returned stale data. Please disconnect the Pico, reconnect it, and try again.');
      }
      const linkRes = await fetch('/api/employees/enroll-fingerprint', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ employeeId: emp.employeeId, fingerprintId: fpId }),
      });
      const linkData = await linkRes.json().catch(() => ({}));
      if (!linkRes.ok) throw new Error(linkData.error || `HTTP ${linkRes.status}`);
      onEnrolled(`${emp.fullName} enrolled on slot ${fpId} via hardware sensor.`);
    } catch (err) {
      if (err.name === 'AbortError' || err.name === 'NotFoundError') setError('Cancelled or no port selected.');
      else setError(err.message || 'Capture failed');
    } finally {
      if (bridgeStopped) {
        const startRes = await requestBridgeStart();
        appendLog(startRes.ok ? 'bridge.py restarted.' : 'Could not restart bridge.py — run it manually.');
      }
      abortRef.current = null;
      setCapturing(false);
    }
  };

  // ── New employee form submit ───────────────────────────────────────────────────
  // On the capture tab: create employee then immediately run sensor capture.
  // On the database tab: create employee and link slot in DB only.
  const handleCreateEmployee = async e => {
    e.preventDefault();
    setError('');
    if (!newEmp.fullName.trim() || !newEmp.department.trim()) {
      setError('Full name and department are required.'); return;
    }
    const fpId = parseInt(slot, 10);
    if (isNaN(fpId) || fpId < SLOT_MIN || fpId > SLOT_MAX) {
      setError(`Enter a valid AS608 slot (${SLOT_MIN}–${SLOT_MAX}).`); return;
    }
    setCreating(true);
    let created = null;
    try {
      const res = await fetch('/api/employees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({
          fullName:     newEmp.fullName.trim(),
          department:   newEmp.department.trim(),
          employeeId:   newEmp.employeeId.trim() || undefined,
          email:        newEmp.email.trim() || undefined,
          salary:       newEmp.salary ? Number(newEmp.salary) : undefined,
          nationalId:   newEmp.nationalId.trim() || undefined,
          contractType: newEmp.contractType,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      created = data;
      setAllEmployees(prev => [...prev, data]);
      setSelected(data);
      setSearch(data.fullName || data.employeeId || '');
      setEmpMode('search');
    } catch (err) {
      setError(err.message);
      setCreating(false);
      return;
    }
    setCreating(false);
    if (tab === 'capture') {
      await runCapture(created, fpId);
    } else {
      // Database tab: just link the slot number in MongoDB.
      try {
        const res = await fetch('/api/employees/enroll-fingerprint', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
          body: JSON.stringify({ employeeId: created.employeeId, fingerprintId: fpId }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
        onEnrolled(`${created.fullName} enrolled on slot ${fpId}.`);
      } catch (err) {
        setError(err.message);
      }
    }
  };

  // ── Existing employee enroll ──────────────────────────────────────────────────
  const handleDatabaseEnroll = async e => {
    e.preventDefault();
    setError('');
    const fpId = parseInt(slot, 10);
    if (!selected) { setError('Select or create an employee first.'); return; }
    if (isNaN(fpId) || fpId < SLOT_MIN || fpId > SLOT_MAX) { setError(`Slot must be ${SLOT_MIN}–${SLOT_MAX}.`); return; }
    setSaving(true);
    try {
      const res = await fetch('/api/employees/enroll-fingerprint', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ employeeId: selected.employeeId, fingerprintId: fpId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      onEnrolled(`${selected.fullName} enrolled on slot ${fpId}.`);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleUsbEnroll = async () => {
    setError('');
    const fpId = parseInt(slot, 10);
    if (!selected) { setError('Select an employee first.'); return; }
    if (isNaN(fpId) || fpId < SLOT_MIN || fpId > SLOT_MAX) { setError(`Slot must be ${SLOT_MIN}–${SLOT_MAX}.`); return; }
    await runCapture(selected, fpId);
  };

  // ── Capture step UI helpers ───────────────────────────────────────────────────
  const phaseCard = () => {
    if (!capturePhase) return null;
    const step = phaseToStep(capturePhase);
    const cfg = {
      connecting: { bg: 'bg-blue-50 border-blue-200',    ic: 'text-blue-500',   title: 'Connecting to sensor…',       desc: 'Opening USB serial port to the Pico W.' },
      ready:      { bg: 'bg-blue-50 border-blue-200',    ic: 'text-blue-500',   title: 'Sensor ready',                desc: 'Command sent. Follow prompts on the sensor.' },
      scan1:      { bg: 'bg-indigo-50 border-indigo-200',ic: 'text-indigo-600 animate-pulse', title: 'Place finger — scan 1 of 2', desc: 'Press firmly and evenly on the sensor. Hold still.' },
      remove:     { bg: 'bg-amber-50 border-amber-200',  ic: 'text-amber-500',  title: 'Remove your finger',          desc: 'Lift briefly, then place it again for the second scan.' },
      scan2:      { bg: 'bg-indigo-50 border-indigo-200',ic: 'text-indigo-600 animate-pulse', title: 'Place finger — scan 2 of 2', desc: 'Same finger, same position. Hold still.' },
      success:    { bg: 'bg-emerald-50 border-emerald-200', ic: 'text-emerald-500', title: 'Fingerprint enrolled!',   desc: 'Template saved on AS608 and linked in the database.' },
      error:      { bg: 'bg-red-50 border-red-200',      ic: 'text-red-500',    title: 'Enrollment failed',           desc: captureError || 'Unknown error.' },
    }[capturePhase];
    if (!cfg) return null;
    return (
      <div className="space-y-3">
        {/* Step tracker */}
        <div className="flex items-center">
          {ENROLL_STEPS.map((label, i) => {
            const done   = capturePhase === 'success' || step > i;
            const active = capturePhase !== 'success' && capturePhase !== 'error' && step === i;
            const err    = capturePhase === 'error' && step === i;
            return (
              <React.Fragment key={label}>
                <div className="flex flex-col items-center gap-1 shrink-0">
                  <div className={clsx('w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all',
                    done ? 'bg-emerald-500 text-white' : err ? 'bg-red-500 text-white' :
                    active ? 'bg-primary text-white ring-2 ring-primary/30' : 'bg-gray-100 text-gray-400')}>
                    {done ? <CheckCircle2 className="w-3.5 h-3.5" /> : i + 1}
                  </div>
                  <span className={clsx('text-[10px] font-medium',
                    done ? 'text-emerald-600' : active ? 'text-primary' : 'text-gray-400')}>{label}</span>
                </div>
                {i < ENROLL_STEPS.length - 1 && (
                  <div className={clsx('flex-1 h-0.5 mx-1 mb-4 rounded-full', done ? 'bg-emerald-400' : 'bg-gray-200')} />
                )}
              </React.Fragment>
            );
          })}
        </div>
        {/* Status card */}
        <div className={clsx('rounded-xl border p-4 flex items-start gap-3', cfg.bg)}>
          <div className={clsx('shrink-0 mt-0.5', cfg.ic)}>
            {capturePhase === 'success' ? <CheckCircle2 className="w-6 h-6" /> :
             capturePhase === 'error'   ? <AlertCircle  className="w-6 h-6" /> :
             <FingerprintPattern className="w-6 h-6" />}
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900">{cfg.title}</p>
            <p className="text-xs text-gray-600 mt-0.5">{cfg.desc}</p>
            {capturePhase === 'error' && <p className="text-xs text-gray-400 mt-1">Tip: use the same finger in the same position for both scans.</p>}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40"
      onClick={e => { if (e.target === e.currentTarget && !busy) onClose(); }}
    >
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[92vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <UserPlus className="w-5 h-5 text-primary" /> Enroll fingerprint
          </h2>
          <button onClick={onClose} disabled={busy} className="p-2 rounded-lg text-gray-400 hover:bg-gray-100 disabled:opacity-40">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Method tabs */}
        <div className="flex gap-1 px-6 pt-3 border-b border-gray-100">
          {[{ id: 'database', icon: Database, label: 'Database only' }, { id: 'capture', icon: Usb, label: 'Capture on sensor' }].map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={clsx('flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-t-lg border-b-2 -mb-px transition-colors',
                tab === t.id ? 'border-primary text-primary' : 'border-transparent text-gray-500 hover:text-gray-700')}>
              <t.icon className="w-4 h-4" /> {t.label}
            </button>
          ))}
        </div>

        <div className="p-6 space-y-5">
          {error && <div className="text-sm text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</div>}

          {/* ── Employee section ──────────────────────────────────── */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-semibold text-gray-800">Employee</label>
              {!selected && (
                <button type="button" disabled={busy}
                  onClick={() => { const n = empMode === 'search' ? 'new' : 'search'; setEmpMode(n); if (n === 'new') setTab('capture'); setError(''); }}
                  className="text-xs font-medium text-primary hover:underline disabled:opacity-50">
                  {empMode === 'search' ? '+ Add new employee' : '← Search existing'}
                </button>
              )}
              {selected && (
                <button type="button" disabled={busy}
                  onClick={() => { setSelected(null); setSearch(''); setEmpMode('search'); }}
                  className="text-xs text-gray-400 hover:text-gray-700 disabled:opacity-50">Change</button>
              )}
            </div>

            {selected ? (
              <div className="px-4 py-3 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-sm font-semibold text-blue-900">{selected.fullName}</p>
                <p className="text-xs text-blue-600 mt-0.5">{selected.employeeId} · {selected.department}</p>
                {selected.fingerprintId != null && (
                  <p className="text-xs text-amber-600 mt-1">Already on slot {selected.fingerprintId} — saving will update it.</p>
                )}
              </div>
            ) : empMode === 'search' ? (
              <div>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input type="text" value={search} onChange={e => { setSearch(e.target.value); setSelected(null); }}
                    placeholder="Name, ID, or department…" disabled={busy}
                    className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none text-sm" />
                </div>
                {filtered.length > 0 && (
                  <div className="mt-1 border border-gray-200 rounded-lg overflow-hidden max-h-44 overflow-y-auto shadow-sm">
                    {filtered.slice(0, 30).map(emp => (
                      <button key={emp._id || emp.employeeId} type="button"
                        onClick={() => { setSelected(emp); setSearch(emp.fullName || emp.employeeId); }}
                        className="w-full text-left px-3 py-2.5 hover:bg-blue-50 transition-colors border-b border-gray-100 last:border-0">
                        <p className="text-sm font-medium text-gray-900">{emp.fullName || emp.employeeId}</p>
                        <p className="text-xs text-gray-500">{emp.employeeId} · {emp.department}</p>
                      </button>
                    ))}
                  </div>
                )}
                {filtered.length === 0 && search && (
                  <p className="mt-2 text-xs text-gray-400 text-center">No match — click <strong>+ Add new employee</strong> to create one.</p>
                )}
              </div>
            ) : (
              /* ── Create new employee form ── */
              <form onSubmit={handleCreateEmployee} className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <label className="block text-xs font-medium text-gray-600 mb-1">Full name <span className="text-red-500">*</span></label>
                    <input name="fullName" value={newEmp.fullName} onChange={handleNewEmpChange} required
                      placeholder="e.g. Tendai Moyo" disabled={creating}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none" />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-medium text-gray-600 mb-1">Department <span className="text-red-500">*</span></label>
                    <input name="department" value={newEmp.department} onChange={handleNewEmpChange} required
                      list="dept-list" placeholder="e.g. Finance" disabled={creating}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none" />
                    <datalist id="dept-list">{DEPARTMENTS.map(d => <option key={d} value={d} />)}</datalist>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Employee ID</label>
                    <input name="employeeId" value={newEmp.employeeId} onChange={handleNewEmpChange}
                      placeholder="Auto-generated" disabled={creating}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-mono focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Contract type</label>
                    <select name="contractType" value={newEmp.contractType} onChange={handleNewEmpChange} disabled={creating}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none bg-white">
                      {['Full-Time', 'Part-Time', 'Contract', 'Temporary'].map(v => <option key={v}>{v}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">National ID</label>
                    <input name="nationalId" value={newEmp.nationalId} onChange={handleNewEmpChange}
                      placeholder="Optional" disabled={creating}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Salary (USD)</label>
                    <input name="salary" value={newEmp.salary} onChange={handleNewEmpChange}
                      type="number" min="0" placeholder="Optional" disabled={creating}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none" />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
                    <input name="email" value={newEmp.email} onChange={handleNewEmpChange}
                      type="email" placeholder="Optional" disabled={creating}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none" />
                  </div>
                  {/* Slot field lives inside the form so it's always filled before submit */}
                  <div className="col-span-2">
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      AS608 slot (0–162) <span className="text-red-500">*</span>
                    </label>
                    <input type="number" min={SLOT_MIN} max={SLOT_MAX} value={slot}
                      onChange={e => setSlot(e.target.value)} placeholder="e.g. 1"
                      disabled={creating}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-mono focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none" />
                  </div>
                </div>
                <button type="submit" disabled={creating}
                  className="w-full px-4 py-2.5 rounded-lg bg-emerald-600 text-white font-medium hover:opacity-90 disabled:opacity-50 text-sm">
                  {creating
                    ? 'Creating employee…'
                    : tab === 'capture' ? 'Create & capture fingerprint' : 'Create employee & save slot'}
                </button>
              </form>
            )}
          </div>

          {/* ── Slot input (existing employee flow) ──────────────────── */}
          {(selected || empMode === 'search') && (
            <div>
              <label className="block text-sm font-semibold text-gray-800 mb-1">AS608 template slot (0–162)</label>
              <input type="number" min={SLOT_MIN} max={SLOT_MAX} value={slot}
                onChange={e => setSlot(e.target.value)} placeholder="e.g. 1" disabled={busy}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none font-mono text-sm" />
            </div>
          )}

          {/* ── Database only actions ─────────────────────────────────── */}
          {tab === 'database' && empMode === 'search' && (
            <div className="space-y-3">
              <p className="text-xs text-gray-500">Links the slot to the employee in MongoDB — no hardware needed.</p>
              <div className="flex gap-2">
                <button onClick={onClose} disabled={busy} className="flex-1 px-4 py-2.5 rounded-lg border border-gray-200 text-gray-700 font-medium hover:bg-gray-50 disabled:opacity-50 text-sm">Cancel</button>
                <button onClick={handleDatabaseEnroll} disabled={busy || !selected}
                  className="flex-1 px-4 py-2.5 rounded-lg bg-primary text-white font-medium hover:opacity-90 disabled:opacity-50 text-sm">
                  {saving ? 'Saving…' : 'Save enrollment'}
                </button>
              </div>
            </div>
          )}

          {/* ── Capture on sensor actions ─────────────────────────────── */}
          {tab === 'capture' && empMode === 'search' && (
            <div className="space-y-4">
              {!webSerialOk && (
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                  Web Serial requires Chrome or Edge on localhost/HTTPS. Switch to <strong>Database only</strong> or use the Python bridge.
                </p>
              )}
              {capturePhase ? phaseCard() : (
                <p className="text-xs text-gray-500">Connects to the Pico over USB, sends the enroll command to the AS608, and saves the result in MongoDB. Scan the finger <strong>twice</strong> when prompted.</p>
              )}
              <div className="flex gap-2">
                <button onClick={onClose} disabled={capturing} className="flex-1 px-4 py-2.5 rounded-lg border border-gray-200 text-gray-700 font-medium hover:bg-gray-50 disabled:opacity-50 text-sm">Cancel</button>
                {capturing
                  ? <button onClick={() => abortRef.current?.abort()} className="flex-1 px-4 py-2.5 rounded-lg bg-red-600 text-white font-medium hover:opacity-90 text-sm">Stop capture</button>
                  : <button onClick={handleUsbEnroll} disabled={!webSerialOk || !selected}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-white font-medium hover:opacity-90 disabled:opacity-50 text-sm">
                      <Usb className="w-4 h-4" />
                      {capturePhase === 'error' ? 'Try again' : 'Choose port & capture'}
                    </button>
                }
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

function fmtTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now - d;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1)  return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24)   return `${diffH}h ago`;
  return d.toLocaleDateString();
}

// ─── Main page ─────────────────────────────────────────────────────────────────
const FingerprintDashboard = () => {
  const [enrolled,     setEnrolled]     = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState(null);
  const [enrollOpen,   setEnrollOpen]   = useState(false);
  const [toast,        setToast]        = useState(null);
  const [recentScans,  setRecentScans]  = useState([]);
  const [scanPulse,    setScanPulse]    = useState(false);
  const [markingId,    setMarkingId]    = useState(null);
  const prevScanRef = useRef(null);
  const todayStr = new Date().toLocaleDateString('en-CA');

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 5000);
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/employees/enrolled', { headers: getAuthHeaders() });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setEnrolled(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e.message || 'Could not load enrolled employees');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadRecentScans = useCallback(async () => {
    try {
      const res = await fetch('/api/attendance/recent?limit=15', { headers: getAuthHeaders() });
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data)) {
        // Flash pulse indicator when a new scan appears
        const topId = data[0]?.employeeId;
        if (topId && topId !== prevScanRef.current) {
          prevScanRef.current = topId;
          setScanPulse(true);
          setTimeout(() => setScanPulse(false), 1500);
        }
        setRecentScans(data);
      }
    } catch {
      /* silent — live feed is best-effort */
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    loadRecentScans();
    const id = setInterval(loadRecentScans, 5000);
    return () => clearInterval(id);
  }, [loadRecentScans]);

  const handleEnrolled = async (msg) => {
    setEnrollOpen(false);
    showToast(msg);
    await load();
  };

  const handleMarkPresent = async (emp) => {
    setMarkingId(emp.employeeId);
    try {
      const res = await fetch('/api/attendance/manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ employeeId: emp.employeeId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      showToast(data.message || `Attendance marked for ${emp.fullName}`);
      await load();
    } catch (err) {
      showToast(`Error: ${err.message}`);
    } finally {
      setMarkingId(null);
    }
  };

  return (
    <div className="space-y-8 pb-10">
      {/* Header */}
      <div className="fade-in flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight flex items-center gap-3">
            <FingerprintPattern className="w-9 h-9 text-primary shrink-0" />
            Fingerprint dashboard
          </h1>
          <p className="text-gray-500 mt-1 text-sm max-w-2xl">
            Manage AS608 fingerprint enrollment for employees. Enrolled employees are matched during attendance scans. Use <strong>Database only</strong> to link a slot without hardware, or <strong>Capture on sensor</strong> with a Pico connected via USB.
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setEnrollOpen(true)} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border-2 border-primary text-primary bg-white font-medium hover:bg-primary/5 transition-colors shadow-sm text-sm">
            <UserPlus className="w-4 h-4" /> Enroll member
          </button>
          <button onClick={load} disabled={loading} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-white font-medium hover:opacity-90 disabled:opacity-50 shadow-sm text-sm">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div className="flex items-center gap-3 p-4 rounded-lg bg-emerald-50 border border-emerald-100 text-emerald-900">
          <CheckCircle2 className="w-5 h-5 shrink-0" />
          <p className="text-sm font-medium">{toast}</p>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-start gap-3 p-4 rounded-lg bg-red-50 border border-red-100 text-red-800">
          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-sm">Could not load enrolled employees</p>
            <p className="text-xs mt-1 opacity-80">{error}</p>
          </div>
        </div>
      )}

      {/* Stats bar */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <div className="glass-card p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
            <FingerprintPattern className="w-5 h-5 text-primary" />
          </div>
          <div>
            <p className="text-2xl font-bold text-gray-900">{enrolled.length}</p>
            <p className="text-xs text-gray-500">Enrolled employees</p>
          </div>
        </div>
        <div className="glass-card p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
            <AlertCircle className="w-5 h-5 text-red-500" />
          </div>
          <div>
            <p className="text-2xl font-bold text-gray-900">{enrolled.filter(e => e.riskLevel === 'High' || e.riskLevel === 'Critical').length}</p>
            <p className="text-xs text-gray-500">High-risk enrolled</p>
          </div>
        </div>
        <div className="glass-card p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center">
            <Shield className="w-5 h-5 text-emerald-600" />
          </div>
          <div>
            <p className="text-2xl font-bold text-gray-900">{enrolled.filter(e => e.riskLevel === 'Low').length}</p>
            <p className="text-xs text-gray-500">Low-risk enrolled</p>
          </div>
        </div>
      </div>

      {/* Attendance Register */}
      <div className="glass-card overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Attendance register</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              {enrolled.filter(e => e.lastAttendanceDate === todayStr).length} of {enrolled.length} enrolled employees marked present today
            </p>
          </div>
          <div className="flex items-center gap-3 text-xs text-gray-500">
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-emerald-400 inline-block" />Present</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-gray-200 inline-block" />Absent</span>
          </div>
        </div>

        {loading ? (
          <div className="p-12 text-center text-gray-400 animate-pulse">Loading…</div>
        ) : enrolled.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <FingerprintPattern className="w-12 h-12 text-gray-200 mx-auto" />
            <p className="text-gray-500 font-medium">No employees enrolled yet</p>
            <p className="text-sm text-gray-400">Click <strong>Enroll member</strong> to add and enroll an employee.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="bg-gray-50/80 text-gray-600 uppercase text-xs tracking-wide">
                  <th className="px-5 py-3 font-semibold w-8" />
                  <th className="px-5 py-3 font-semibold">Employee</th>
                  <th className="px-5 py-3 font-semibold">Department</th>
                  <th className="px-5 py-3 font-semibold text-center">Slot</th>
                  <th className="px-5 py-3 font-semibold text-center">Days present</th>
                  <th className="px-5 py-3 font-semibold">Last scan</th>
                  <th className="px-5 py-3 font-semibold">Risk</th>
                  <th className="px-5 py-3 font-semibold" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {enrolled.map(emp => {
                  const presentToday = emp.lastAttendanceDate === todayStr;
                  const isMarking = markingId === emp.employeeId;
                  return (
                    <tr key={emp._id || emp.employeeId} className={clsx('transition-colors', presentToday ? 'bg-emerald-50/40 hover:bg-emerald-50/60' : 'hover:bg-gray-50/50')}>
                      <td className="px-5 py-3.5 text-center">
                        <span className={clsx('w-2.5 h-2.5 rounded-full inline-block', presentToday ? 'bg-emerald-400' : 'bg-gray-200')} />
                      </td>
                      <td className="px-5 py-3.5">
                        <p className="font-medium text-gray-900">{emp.fullName || '—'}</p>
                        <p className="text-xs text-gray-400 font-mono">{emp.employeeId}</p>
                      </td>
                      <td className="px-5 py-3.5 text-gray-600">{emp.department || '—'}</td>
                      <td className="px-5 py-3.5 text-center font-mono font-bold text-primary">{emp.fingerprintId}</td>
                      <td className="px-5 py-3.5 text-center font-bold text-gray-800">{emp.attendanceDays ?? 0}</td>
                      <td className="px-5 py-3.5 text-xs text-gray-500">{fmtTime(emp.lastActive)}</td>
                      <td className="px-5 py-3.5">
                        <span className={clsx('px-2 py-0.5 rounded-full text-xs font-medium', RISK_COLORS[emp.riskLevel] || 'bg-gray-100 text-gray-600')}>
                          {emp.riskLevel || 'Unknown'}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        {presentToday ? (
                          <span className="inline-flex items-center gap-1 text-xs text-emerald-700 font-medium">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Present
                          </span>
                        ) : (
                          <button
                            onClick={() => handleMarkPresent(emp)}
                            disabled={isMarking}
                            className="px-3 py-1.5 rounded-lg bg-primary text-white text-xs font-medium hover:opacity-90 disabled:opacity-50 whitespace-nowrap"
                          >
                            {isMarking ? 'Marking…' : 'Mark present'}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Live scan feed */}
      <div className="glass-card overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <Activity className={clsx('w-5 h-5 transition-colors', scanPulse ? 'text-emerald-500' : 'text-gray-400')} />
            Live scan feed
            <span className="text-xs font-normal text-gray-400 ml-1">· updates every 5 s</span>
          </h2>
          <span className={clsx('w-2.5 h-2.5 rounded-full', scanPulse ? 'bg-emerald-400 animate-ping' : 'bg-gray-200')} />
        </div>

        {recentScans.length === 0 ? (
          <div className="p-10 text-center space-y-2">
            <Clock className="w-10 h-10 text-gray-200 mx-auto" />
            <p className="text-gray-400 text-sm">No scans in the last 24 hours</p>
            <p className="text-xs text-gray-400">Attendance events appear here in real time as employees scan in.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="bg-gray-50/80 text-gray-600 uppercase text-xs tracking-wide">
                  <th className="px-6 py-3 font-semibold">Employee</th>
                  <th className="px-6 py-3 font-semibold">Department</th>
                  <th className="px-6 py-3 font-semibold text-center">Days Present</th>
                  <th className="px-6 py-3 font-semibold">Last Scan</th>
                  <th className="px-6 py-3 font-semibold">Risk</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {recentScans.map((emp, i) => (
                  <tr key={emp._id || emp.employeeId} className={clsx('transition-colors', i === 0 && scanPulse ? 'bg-emerald-50' : 'hover:bg-gray-50/50')}>
                    <td className="px-6 py-3.5">
                      <p className="font-medium text-gray-900">{emp.fullName || '—'}</p>
                      <p className="text-xs text-gray-400">{emp.employeeId}</p>
                    </td>
                    <td className="px-6 py-3.5 text-gray-600">{emp.department || '—'}</td>
                    <td className="px-6 py-3.5 text-center font-mono font-bold text-primary">{emp.attendanceDays ?? 0}</td>
                    <td className="px-6 py-3.5 text-gray-500 text-xs">{fmtTime(emp.lastActive)}</td>
                    <td className="px-6 py-3.5">
                      <span className={clsx('px-2 py-0.5 rounded-full text-xs font-medium', RISK_COLORS[emp.riskLevel] || 'bg-gray-100 text-gray-600')}>
                        {emp.riskLevel || 'Unknown'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {enrollOpen && <EnrollModal onClose={() => setEnrollOpen(false)} onEnrolled={handleEnrolled} />}
    </div>
  );
};

export default FingerprintDashboard;
