/**
 * Same algorithm as fingerprint_module/common/employee_id.py (SHA-256 → FP-XXXXXXXXXX).
 */
export async function stableEmployeeId(email) {
  const normalized = String(email).trim().toLowerCase();
  const enc = new TextEncoder().encode(normalized);
  const buf = await crypto.subtle.digest('SHA-256', enc);
  const hex = Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  const ten = hex.slice(0, 10).toUpperCase();
  return `FP-${ten}`;
}
