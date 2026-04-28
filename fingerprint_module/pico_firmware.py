"""
pico_firmware.py — Raspberry Pi Pico W
Runs on the Pico W. Communicates with the AS608 fingerprint sensor
over UART and forwards events to the Python bridge on the laptop
via USB Serial (stdin/stdout).

Wiring:
  AS608 TX  →  Pico GP1 (UART0 RX)
  AS608 RX  →  Pico GP0 (UART0 TX)
  AS608 VCC →  Pico 3.3V
  AS608 GND →  Pico GND
"""

import machine
import sys
import time

try:
    import select

    _STDIN_POLL = select.poll()
    _STDIN_POLL.register(sys.stdin, select.POLLIN)
except (ImportError, AttributeError):
    _STDIN_POLL = None

# ── UART setup for AS608 ──────────────────────────────────────────────────────
uart = machine.UART(0, baudrate=57600, tx=machine.Pin(0), rx=machine.Pin(1))

# ── AS608 command constants ───────────────────────────────────────────────────
CMD_VERIFY    = bytes([0xEF, 0x01, 0xFF, 0xFF, 0xFF, 0xFF, 0x01,
                       0x00, 0x03, 0x04, 0x00, 0x08])  # GenImg + Img2Tz + Search
CMD_GEN_IMG   = bytes([0xEF, 0x01, 0xFF, 0xFF, 0xFF, 0xFF, 0x01,
                       0x00, 0x03, 0x01, 0x00, 0x05])  # GenImg
CMD_IMG2TZ1   = bytes([0xEF, 0x01, 0xFF, 0xFF, 0xFF, 0xFF, 0x01,
                       0x00, 0x04, 0x02, 0x01, 0x00, 0x08])  # Img2Tz slot 1
CMD_IMG2TZ2   = bytes([0xEF, 0x01, 0xFF, 0xFF, 0xFF, 0xFF, 0x01,
                       0x00, 0x04, 0x02, 0x02, 0x00, 0x09])  # Img2Tz slot 2
CMD_CREATE    = bytes([0xEF, 0x01, 0xFF, 0xFF, 0xFF, 0xFF, 0x01,
                       0x00, 0x03, 0x05, 0x00, 0x09])  # RegModel
RESP_OK       = 0x00

# ── Helpers ───────────────────────────────────────────────────────────────────

def send_to_bridge(command: str, data: str):
    """Print a structured line that the laptop bridge will parse."""
    print(f"{command}:{data}", end="\r\n")


def uart_cmd(cmd: bytes, wait_ms: int = 200) -> bytes:
    uart.write(cmd)
    time.sleep_ms(wait_ms)
    return uart.read() or b""


def response_ok(raw: bytes) -> bool:
    """Return True if the sensor ACK byte is 0x00 (success)."""
    return len(raw) >= 10 and raw[9] == RESP_OK


def store_template(slot: int) -> bool:
    """Store CharBuffer 1 into flash at the given slot number."""
    hi, lo = (slot >> 8) & 0xFF, slot & 0xFF
    checksum = 0x01 + 0x00 + 0x06 + 0x0D + hi + lo
    cmd = bytes([0xEF, 0x01, 0xFF, 0xFF, 0xFF, 0xFF, 0x01,
                 0x00, 0x06, 0x0D, 0x01, hi, lo,
                 (checksum >> 8) & 0xFF, checksum & 0xFF])
    raw = uart_cmd(cmd, 200)
    return response_ok(raw)


def search_library() -> int:
    """Search all templates; return matched page ID or -1."""
    cmd = bytes([0xEF, 0x01, 0xFF, 0xFF, 0xFF, 0xFF, 0x01,
                 0x00, 0x08, 0x04, 0x01, 0x00, 0x00, 0x03, 0xE8,
                 0x00, 0xFF])
    raw = uart_cmd(cmd, 300)
    if len(raw) >= 14 and raw[9] == RESP_OK:
        return (raw[10] << 8) | raw[11]
    return -1


# ── Host serial (USB) commands from ``bridge.py`` ─────────────────────────────

def _read_host_line():
    """Non-blocking read of one line from USB serial (ENROLL:... from the PC)."""
    if _STDIN_POLL is None or not _STDIN_POLL.poll(0):
        return None
    raw = sys.stdin.readline()
    if not raw:
        return None
    if isinstance(raw, bytes):
        try:
            return raw.decode("utf-8").strip()
        except UnicodeError:
            return None
    return str(raw).strip()


def _handle_host_command(line: str) -> None:
    # Major step: bridge sends ENROLL:<stable_employee_id>,<slot>
    if not line.startswith("ENROLL:"):
        return
    payload = line[7:].strip()
    parts = payload.split(",", 1)
    if len(parts) != 2 or not parts[1].strip().isdigit():
        send_to_bridge("ERROR", f"Bad ENROLL line: {line!r}")
        return
    emp = parts[0].strip()
    slot = int(parts[1].strip())
    enroll_fingerprint(emp, slot)


# ── Modes ─────────────────────────────────────────────────────────────────────

def attendance_tick() -> None:
    """Single poll cycle for attendance (called from the main loop)."""
    # Step 1: capture image
    raw = uart_cmd(CMD_GEN_IMG, 200)
    if not response_ok(raw):
        time.sleep(0.05)
        return

    # Step 2: convert image → CharBuffer 1
    raw = uart_cmd(CMD_IMG2TZ1, 200)
    if not response_ok(raw):
        send_to_bridge("ERROR", "Image conversion failed")
        time.sleep(0.2)
        return

    # Step 3: search library
    matched_id = search_library()
    if matched_id >= 0:
        send_to_bridge("ATTENDANCE", str(matched_id))
    else:
        send_to_bridge("STATUS", "No match found")

    time.sleep(1)  # debounce


def main_loop() -> None:
    """
    Major step: interleave USB commands (enrollment) with attendance scanning.
    """
    send_to_bridge("STATUS", "Attendance + serial ENROLL active")
    while True:
        line = _read_host_line()
        if line:
            _handle_host_command(line)
            continue
        attendance_tick()


def enroll_fingerprint(employee_id: str, slot: int):
    """
    Guided two-scan enrollment.
    employee_id: the employeeId string (e.g. "EMP001")
    slot: AS608 template slot to store the fingerprint (0–162)
    """
    send_to_bridge("STATUS", f"Place finger on sensor (scan 1/2) for {employee_id}")
    time.sleep(3)

    # Scan 1 ──────────────────────────────────────────────────────────────────
    raw = uart_cmd(CMD_GEN_IMG, 200)
    if not response_ok(raw):
        send_to_bridge("ERROR", "Scan 1 failed — no finger detected")
        return

    raw = uart_cmd(CMD_IMG2TZ1, 200)
    if not response_ok(raw):
        send_to_bridge("ERROR", "Scan 1 image conversion failed")
        return

    send_to_bridge("STATUS", "Lift finger, then place again (scan 2/2)")
    time.sleep(2)

    # Scan 2 ──────────────────────────────────────────────────────────────────
    raw = uart_cmd(CMD_GEN_IMG, 200)
    if not response_ok(raw):
        send_to_bridge("ERROR", "Scan 2 failed — no finger detected")
        return

    raw = uart_cmd(CMD_IMG2TZ2, 200)
    if not response_ok(raw):
        send_to_bridge("ERROR", "Scan 2 image conversion failed")
        return

    # Create model & store ───────────────────────────────────────────────────
    raw = uart_cmd(CMD_CREATE, 200)
    if not response_ok(raw):
        send_to_bridge("ERROR", "Template creation failed — prints did not match")
        return

    if store_template(slot):
        send_to_bridge("ENROLL_SUCCESS", f"{employee_id},{slot}")
    else:
        send_to_bridge("ERROR", f"Failed to save template at slot {slot}")


# ── Entry point ───────────────────────────────────────────────────────────────
# ATTENDANCE:<slot> → bridge → Flask POST /attendance/scan
# ENROLL:... from bridge → enroll_fingerprint → ENROLL_SUCCESS → POST /register_user
main_loop()
