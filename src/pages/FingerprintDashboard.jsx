import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  FingerprintPattern,
  RefreshCw,
  AlertCircle,
  UserPlus,
  X,
  CheckCircle2,
  Usb,
  Database,
} from 'lucide-react';
import { stableEmployeeId } from '../lib/stableEmployeeId';
import { isWebSerialSupported, enrollFingerprintViaPicoSerial } from '../lib/picoSerialEnroll';
import { requestBridgeStop, requestBridgeStart } from '../lib/bridgeControl';

function fingerprintApiPath(suffix) {
  const base = import.meta.env.VITE_FINGERPRINT_API_URL;
  if (base) {
    return `${String(base).replace(/\/$/, '')}${suffix}`;
  }
  return `/fingerprint-api${suffix}`;
}

const SLOT_MIN = 0;
const SLOT_MAX = 162;

const FingerprintDashboard = () => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [enrollOpen, setEnrollOpen] = useState(false);
  const [enrollTab, setEnrollTab] = useState('capture');
  const [enrollName, setEnrollName] = useState('');
  const [enrollEmail, setEnrollEmail] = useState('');
  const [enrollSlot, setEnrollSlot] = useState('');
  const [enrollSubmitting, setEnrollSubmitting] = useState(false);
  const [captureSubmitting, setCaptureSubmitting] = useState(false);
  const [serialLog, setSerialLog] = useState([]);
  const captureAbortRef = useRef(null);

  const [enrollError, setEnrollError] = useState(null);
  const [enrollSuccess, setEnrollSuccess] = useState(null);

  const webSerialOk = isWebSerialSupported();
  const captureBusy = captureSubmitting;
  const anyEnrollBusy = enrollSubmitting || captureBusy;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(fingerprintApiPath('/enrolled'));
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      if (!data.ok) {
        throw new Error(data.error || 'Unexpected response');
      }
      setUsers(Array.isArray(data.users) ? data.users : []);
    } catch (e) {
      setError(e.message || 'Could not load fingerprint enrollments');
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!enrollOpen) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape' && !anyEnrollBusy) setEnrollOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enrollOpen, anyEnrollBusy]);

  const resetEnrollForm = () => {
    setEnrollName('');
    setEnrollEmail('');
    setEnrollSlot('');
    setEnrollError(null);
    setSerialLog([]);
  };

  const registerUserApi = async (name, email, fingerprintId) => {
    const res = await fetch(fingerprintApiPath('/register_user'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, fingerprint_id: fingerprintId }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || `HTTP ${res.status}`);
    }
    if (!data.ok) {
      throw new Error(data.error || 'Registration failed');
    }
    return data;
  };

  const validateCommonFields = () => {
    const name = enrollName.trim();
    const email = enrollEmail.trim();
    const slot = parseInt(enrollSlot, 10);
    if (!name || !email) {
      setEnrollError('Name and email are required.');
      return null;
    }
    if (Number.isNaN(slot) || slot < SLOT_MIN || slot > SLOT_MAX) {
      setEnrollError(`Template slot must be between ${SLOT_MIN} and ${SLOT_MAX}.`);
      return null;
    }
    return { name, email, slot };
  };

  const handleEnrollSubmit = async (e) => {
    e.preventDefault();
    setEnrollError(null);
    setEnrollSuccess(null);

    const v = validateCommonFields();
    if (!v) return;

    setEnrollSubmitting(true);
    try {
      await registerUserApi(v.name, v.email, v.slot);
      setEnrollSuccess(`${v.name} linked to template slot ${v.slot}.`);
      resetEnrollForm();
      setEnrollOpen(false);
      await load();
    } catch (err) {
      setEnrollError(err.message || 'Could not register');
    } finally {
      setEnrollSubmitting(false);
    }
  };

  const handleCancelCapture = () => {
    captureAbortRef.current?.abort();
  };

  const handleUsbCapture = async () => {
    setEnrollError(null);
    setEnrollSuccess(null);
    setSerialLog([]);

    const v = validateCommonFields();
    if (!v) return;

    if (!webSerialOk) {
      setEnrollError('Use Chrome or Edge on https:// or localhost, or enroll with the Python bridge instead.');
      return;
    }

    const ac = new AbortController();
    captureAbortRef.current = ac;
    setCaptureSubmitting(true);

    let shouldRestartBridge = false;
    let captureOk = false;
    let bridgeRestartOk = false;

    const appendLog = (line) => setSerialLog((prev) => [...prev, line]);

    try {
      const stopRes = await requestBridgeStop();
      if (stopRes.ok) {
        shouldRestartBridge = true;
        appendLog('Paused bridge.py automatically so this tab can open the Pico USB serial port.');
        await new Promise((r) => setTimeout(r, 500));
      } else if (stopRes.unreachable) {
        appendLog(`Bridge API unreachable: ${stopRes.error}`);
      } else if (stopRes.disabled) {
        appendLog(
          'Bridge auto-pause is off. Set ENABLE_FINGERPRINT_BRIDGE_CONTROL=true in Rose .env and restart the Node API (npm run dev:stack), or quit bridge.py manually.',
        );
      } else if (stopRes.wrongHost) {
        appendLog(
          `${stopRes.error || 'Use http://localhost:5173'} — the bridge control endpoint only accepts loopback.`,
        );
      } else {
        appendLog(
          `Could not pause bridge (HTTP ${stopRes.status}): ${stopRes.error || stopRes.message || 'unknown'}. Stop bridge.py manually if the port is busy.`,
        );
      }

      const employeeId = await stableEmployeeId(v.email);
      appendLog(`Employee id for device: ${employeeId}`);

      await enrollFingerprintViaPicoSerial({
        employeeId,
        slot: v.slot,
        signal: ac.signal,
        onLog: (line) => setSerialLog((prev) => [...prev, line]),
      });

      await registerUserApi(v.name, v.email, v.slot);
      captureOk = true;
      await load();
    } catch (err) {
      if (err.name === 'AbortError' || err.name === 'NotFoundError') {
        setEnrollError('Enrollment cancelled or no port was selected.');
      } else if (err.name === 'SecurityError' || err.message?.includes('Failed to open serial port')) {
        setEnrollError(
          'Could not open the serial port. Stop bridge.py or other serial apps using the Pico, then try again.',
        );
      } else {
        setEnrollError(err.message || 'Capture or registration failed');
      }
    } finally {
      if (shouldRestartBridge) {
        const startRes = await requestBridgeStart();
        bridgeRestartOk = !!startRes.ok;
        setSerialLog((prev) => [
          ...prev,
          startRes.ok
            ? 'Started bridge.py again in the background (attendance forwarding).'
            : `Could not auto-start bridge.py${startRes.error ? `: ${startRes.error}` : ''}. Run it manually from fingerprint_module if needed.`,
        ]);
      }
      captureAbortRef.current = null;
      setCaptureSubmitting(false);
    }

    if (captureOk) {
      let msg = `${v.name} enrolled: finger captured on slot ${v.slot} and saved to the database.`;
      if (shouldRestartBridge && bridgeRestartOk) {
        msg += ' bridge.py was restarted for attendance.';
      } else if (shouldRestartBridge && !bridgeRestartOk) {
        msg += ' Start bridge.py manually if you need USB attendance forwarding.';
      }
      setEnrollSuccess(msg);
      resetEnrollForm();
      setEnrollOpen(false);
    }
  };

  return (
    <div className="space-y-8 pb-10">
      <div className="fade-in flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight flex items-center gap-3">
            <FingerprintPattern className="w-9 h-9 text-primary shrink-0" />
            Fingerprint dashboard
          </h1>
          <p className="text-gray-600 mt-1 max-w-2xl">
            <strong>USB sensor:</strong> in Chrome or Edge, open <strong>Enroll member</strong> →{' '}
            <em>Capture on sensor</em>, pick the Pico serial port, then scan twice on the AS608 — the app
            stores the template on the module and registers the user. <strong>Database only</strong> links
            an existing template slot without talking to the Pico. Keep{' '}
            <code className="text-sm bg-gray-100 px-1.5 py-0.5 rounded">npm run dev:stack</code> running
            so Flask (5001) is reachable.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 sm:justify-end">
          <button
            type="button"
            onClick={() => {
              resetEnrollForm();
              setEnrollSuccess(null);
              setEnrollTab(webSerialOk ? 'capture' : 'database');
              setEnrollOpen(true);
            }}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border-2 border-primary text-primary bg-white font-medium hover:bg-primary/5 transition-colors shadow-sm"
          >
            <UserPlus className="w-4 h-4" />
            Enroll member
          </button>
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-white font-medium hover:opacity-90 disabled:opacity-50 transition-opacity shadow-sm"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {enrollSuccess && (
        <div className="flex items-start gap-3 p-4 rounded-lg bg-emerald-50 border border-emerald-100 text-emerald-900">
          <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" />
          <p className="text-sm font-medium">{enrollSuccess}</p>
        </div>
      )}

      {error && (
        <div className="flex items-start gap-3 p-4 rounded-lg bg-red-50 border border-red-100 text-red-800">
          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">Could not reach fingerprint API</p>
            <p className="text-sm mt-1 opacity-90">{error}</p>
          </div>
        </div>
      )}

      <div className="glass-card overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900">Enrolled fingerprints</h2>
          <span className="text-sm text-gray-500">{users.length} total</span>
        </div>

        {loading && !users.length ? (
          <div className="p-12 text-center text-gray-500">Loading…</div>
        ) : users.length === 0 ? (
          <div className="p-12 text-center text-gray-500 space-y-3">
            <p>No enrolled members in the database yet.</p>
            <p className="text-sm">
              Use <strong>Enroll member</strong> → <em>Capture on sensor</em> with the Pico connected over
              USB, or <em>Database only</em> if the template is already on the AS608.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="bg-gray-50/80 text-gray-600 uppercase text-xs tracking-wide">
                  <th className="px-6 py-3 font-semibold">Name</th>
                  <th className="px-6 py-3 font-semibold">Email</th>
                  <th className="px-6 py-3 font-semibold">Fingerprint ID</th>
                  <th className="px-6 py-3 font-semibold">Employee ID</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {users.map((u) => (
                  <tr key={u.id || `${u.employeeId}-${u.fingerprintId}`} className="hover:bg-gray-50/50">
                    <td className="px-6 py-3.5 font-medium text-gray-900">{u.fullName || '—'}</td>
                    <td className="px-6 py-3.5 text-gray-600">{u.email || '—'}</td>
                    <td className="px-6 py-3.5">
                      <span className="font-mono font-semibold text-primary">{u.fingerprintId}</span>
                    </td>
                    <td className="px-6 py-3.5">
                      <code className="text-xs bg-gray-100 px-2 py-1 rounded text-gray-700">
                        {u.employeeId || '—'}
                      </code>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {enrollOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40"
          role="dialog"
          aria-modal="true"
          aria-labelledby="enroll-modal-title"
          onClick={(ev) => {
            if (ev.target === ev.currentTarget && !anyEnrollBusy) setEnrollOpen(false);
          }}
        >
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 id="enroll-modal-title" className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-primary" />
                Enroll member
              </h2>
              <button
                type="button"
                onClick={() => !anyEnrollBusy && setEnrollOpen(false)}
                className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 disabled:opacity-40"
                aria-label="Close"
                disabled={anyEnrollBusy}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="px-6 pt-4 flex gap-2 border-b border-gray-100">
              <button
                type="button"
                onClick={() => setEnrollTab('capture')}
                className={`flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-t-lg border-b-2 -mb-px transition-colors ${
                  enrollTab === 'capture'
                    ? 'border-primary text-primary'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                <Usb className="w-4 h-4" />
                Capture on sensor
              </button>
              <button
                type="button"
                onClick={() => setEnrollTab('database')}
                className={`flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-t-lg border-b-2 -mb-px transition-colors ${
                  enrollTab === 'database'
                    ? 'border-primary text-primary'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                <Database className="w-4 h-4" />
                Database only
              </button>
            </div>

            <div className="p-6 space-y-4">
              {enrollError && (
                <div className="text-sm text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                  {enrollError}
                </div>
              )}

              <div>
                <label htmlFor="enroll-name" className="block text-sm font-medium text-gray-700 mb-1">
                  Full name
                </label>
                <input
                  id="enroll-name"
                  type="text"
                  value={enrollName}
                  onChange={(ev) => setEnrollName(ev.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none"
                  placeholder="Jane Doe"
                  autoComplete="name"
                  disabled={anyEnrollBusy}
                />
              </div>
              <div>
                <label htmlFor="enroll-email" className="block text-sm font-medium text-gray-700 mb-1">
                  Email
                </label>
                <input
                  id="enroll-email"
                  type="email"
                  value={enrollEmail}
                  onChange={(ev) => setEnrollEmail(ev.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none"
                  placeholder="jane@company.com"
                  autoComplete="email"
                  disabled={anyEnrollBusy}
                />
              </div>
              <div>
                <label htmlFor="enroll-slot" className="block text-sm font-medium text-gray-700 mb-1">
                  AS608 template slot
                </label>
                <input
                  id="enroll-slot"
                  type="number"
                  min={SLOT_MIN}
                  max={SLOT_MAX}
                  value={enrollSlot}
                  onChange={(ev) => setEnrollSlot(ev.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none font-mono"
                  placeholder="e.g. 15"
                  disabled={anyEnrollBusy}
                />
              </div>

              {enrollTab === 'capture' && (
                <div className="space-y-3 pt-1">
                  {!webSerialOk && (
                    <p className="text-sm text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                      Web Serial is not available (use <strong>Chrome</strong> or <strong>Edge</strong> on{' '}
                      <code className="text-xs">localhost</code> or HTTPS). You can still use{' '}
                      <strong>Database only</strong> or the Python <code className="text-xs">bridge.py</code>.
                    </p>
                  )}
                  <p className="text-sm text-gray-600">
                    Connect the <strong>Pico</strong> by USB. With{' '}
                    <code className="text-xs bg-gray-100 px-1 rounded">ENABLE_FINGERPRINT_BRIDGE_CONTROL=true</code>{' '}
                    in the Rose <code className="text-xs bg-gray-100 px-1 rounded">.env</code>, the API pauses{' '}
                    <code className="text-xs bg-gray-100 px-1 rounded">bridge.py</code> before capture and starts it
                    again afterward. Otherwise, quit bridge.py manually first. You will pick the serial port, then
                    scan twice when the sensor prompts you. The Pico must run{' '}
                    <code className="text-xs bg-gray-100 px-1 rounded">fingerprint_module/pico_firmware.py</code>{' '}
                    (lines like <code className="text-xs bg-gray-100 px-1 rounded">ENROLL_SUCCESS:</code>); if you see
                    “Please type in the ID #” from the sensor, that is different firmware and will not finish this
                    wizard.
                  </p>
                  {serialLog.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-gray-500 mb-1">Sensor / device log</p>
                      <pre className="text-xs font-mono bg-gray-50 border border-gray-100 rounded-lg p-3 max-h-36 overflow-y-auto whitespace-pre-wrap break-all">
                        {serialLog.join('\n')}
                      </pre>
                    </div>
                  )}
                  <div className="flex gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => !anyEnrollBusy && setEnrollOpen(false)}
                      className="flex-1 px-4 py-2.5 rounded-lg border border-gray-200 text-gray-700 font-medium hover:bg-gray-50 disabled:opacity-50"
                      disabled={captureBusy}
                    >
                      Cancel
                    </button>
                    {captureBusy ? (
                      <button
                        type="button"
                        onClick={handleCancelCapture}
                        className="flex-1 px-4 py-2.5 rounded-lg bg-red-600 text-white font-medium hover:opacity-90"
                      >
                        Stop capture
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={handleUsbCapture}
                        disabled={!webSerialOk}
                        className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-white font-medium hover:opacity-90 disabled:opacity-50"
                      >
                        <Usb className="w-4 h-4" />
                        Choose port &amp; capture
                      </button>
                    )}
                  </div>
                </div>
              )}

              {enrollTab === 'database' && (
                <form onSubmit={handleEnrollSubmit} className="space-y-4 pt-1">
                  <p className="text-sm text-gray-600">
                    Use this when the fingerprint is <strong>already stored</strong> in the chosen slot on the
                    AS608. Employee id is derived from the email (same as USB capture).
                  </p>
                  <div className="flex gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => !enrollSubmitting && setEnrollOpen(false)}
                      className="flex-1 px-4 py-2.5 rounded-lg border border-gray-200 text-gray-700 font-medium hover:bg-gray-50"
                      disabled={enrollSubmitting}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="flex-1 px-4 py-2.5 rounded-lg bg-primary text-white font-medium hover:opacity-90 disabled:opacity-50"
                      disabled={enrollSubmitting}
                    >
                      {enrollSubmitting ? 'Saving…' : 'Save enrollment'}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FingerprintDashboard;
