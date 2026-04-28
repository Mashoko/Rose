/**
 * Ask the Express API to stop/start fingerprint_module/bridge.py (localhost + env flag).
 */

async function postBridge(action) {
  let res;
  try {
    res = await fetch(`/api/fingerprint-bridge/${action}`, { method: 'POST' });
  } catch (e) {
    return {
      ok: false,
      status: 0,
      disabled: false,
      unreachable: true,
      error: e?.message || 'Network error — is the API running on port 5000?',
    };
  }

  const text = await res.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { error: text?.slice(0, 200) || 'Non-JSON response' };
  }

  const ok = res.ok && data.ok === true;

  return {
    ok,
    status: res.status,
    disabled: res.status === 403 && data.reason === 'env',
    wrongHost: res.status === 403 && data.reason === 'host',
    message: data.message,
    error: data.error,
    reason: data.reason,
  };
}

export async function requestBridgeStop() {
  return postBridge('stop');
}

export async function requestBridgeStart() {
  return postBridge('start');
}
