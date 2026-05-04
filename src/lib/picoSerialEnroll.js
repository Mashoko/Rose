/**
 * Drive Raspberry Pi Pico + AS608 enrollment over Web Serial (Chrome / Edge).
 * Protocol matches fingerprint_module/bridge.py and pico_firmware.py (115200 baud, ENROLL: lines).
 */

const BAUD = 115200;

export function isWebSerialSupported() {
  return typeof navigator !== 'undefined' && !!navigator.serial;
}

/**
 * @param {object} opts
 * @param {string} opts.employeeId — FP-… id (from stableEmployeeId)
 * @param {number} opts.slot — AS608 template index
 * @param {(line: string) => void} [opts.onLog]
 * @param {AbortSignal} [opts.signal]
 * @param {number} [opts.timeoutMs] — overall deadline (default 4 min)
 * @returns {Promise<{ reportedEmployeeId: string, reportedSlot: number }>}
 */
export async function enrollFingerprintViaPicoSerial({
  employeeId,
  slot,
  onLog,
  signal,
  timeoutMs = 240000,
}) {
  if (!navigator.serial) {
    throw new Error('Web Serial is not supported in this browser. Use Chrome or Edge, or the Python bridge.');
  }

  let port;
  let reader;

  const onAbort = () => {
    try {
      reader?.cancel();
    } catch {
      /* ignore */
    }
  };
  signal?.addEventListener('abort', onAbort);

  try {
    // User picks the Pico’s USB serial port (often “USB Serial” or similar).
    port = await navigator.serial.requestPort({ filters: [] });
    await port.open({ baudRate: BAUD });
    onLog?.(`Port open at ${BAUD} baud.`);
    await new Promise((r) => setTimeout(r, 800));

    const cmd = `ENROLL:${employeeId},${slot}\r\n`;
    const writer = port.writable.getWriter();
    await writer.write(new TextEncoder().encode(cmd));
    writer.releaseLock();
    onLog?.(`Sent ${cmd.trim()}`);
    onLog?.('Follow prompts on the sensor (two scans).');

    reader = port.readable.getReader();
    const dec = new TextDecoder();
    let buffer = '';
    const started = Date.now();

    while (Date.now() - started < timeoutMs) {
      if (signal?.aborted) {
        throw new DOMException('Enrollment cancelled', 'AbortError');
      }

      const { value, done } = await reader.read();
      if (done) {
        throw new Error('Serial connection closed before enrollment finished.');
      }
      if (!value) continue;

      buffer += dec.decode(value, { stream: true });
      const parts = buffer.split(/\r?\n/);
      buffer = parts.pop() || '';

      for (const raw of parts) {
        const line = raw.trim();
        if (!line) continue;
        onLog?.(line);

        if (line.startsWith('ENROLL_SUCCESS:')) {
          const payload = line.slice('ENROLL_SUCCESS:'.length);
          const [emp, sl] = payload.split(',');
          const reportedSlot = parseInt(String(sl).trim(), 10);
          if (Number.isNaN(reportedSlot)) {
            throw new Error('Invalid ENROLL_SUCCESS line from device.');
          }
          return {
            reportedEmployeeId: emp.trim(),
            reportedSlot,
          };
        }
        if (line.startsWith('ERROR:')) {
          throw new Error(line.slice('ERROR:'.length).trim() || 'Sensor reported an error.');
        }
      }
    }

    throw new Error(
      'Timed out waiting for enrollment. Check the Pico firmware, wiring, and that this slot is free on the AS608.',
    );
  } finally {
    signal?.removeEventListener('abort', onAbort);
    try {
      await reader?.cancel();
    } catch {
      /* ignore */
    }
    try {
      reader?.releaseLock();
    } catch {
      /* ignore */
    }
    try {
      if (port) await port.close();
    } catch {
      /* ignore */
    }
  }
}
