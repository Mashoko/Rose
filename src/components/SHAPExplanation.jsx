import React, { useMemo } from 'react';
import { AlertCircle, TrendingUp, TrendingDown, Minus, CheckCircle2, Info } from 'lucide-react';

// ─── Score band config ─────────────────────────────────────────────────────────
const BANDS = [
  {
    min: 0, max: 39,
    label: 'Low Risk',
    classification: 'NORMAL EMPLOYEE PROFILE',
    range: '0 – 39',
    color: '#22c55e',
    bg: 'bg-emerald-50',
    border: 'border-emerald-200',
    textColor: 'text-emerald-800',
    subText: 'text-emerald-600',
  },
  {
    min: 40, max: 69,
    label: 'Medium Risk',
    classification: 'MEDIUM RISK — REQUIRES REVIEW',
    range: '40 – 69',
    color: '#f59e0b',
    bg: 'bg-amber-50',
    border: 'border-amber-200',
    textColor: 'text-amber-900',
    subText: 'text-amber-700',
  },
  {
    min: 70, max: 100,
    label: 'High Risk',
    classification: 'HIGH RISK — GHOST EMPLOYEE SIGNAL',
    range: '70 – 100',
    color: '#ef4444',
    bg: 'bg-red-50',
    border: 'border-red-200',
    textColor: 'text-red-900',
    subText: 'text-red-700',
  },
];

function getBand(score) {
  const s = Math.min(100, Math.max(0, Number(score) || 0));
  return BANDS.find(b => s >= b.min && s <= b.max) || BANDS[0];
}

// ─── Feature metadata ──────────────────────────────────────────────────────────
const FEATURE_META = {
  anomalyScore:                 { label: 'Anomaly Score',              direction: 'positive', unit: '',      max: 100 },
  riskScore:                    { label: 'Risk Score',                 direction: 'positive', unit: '',      max: 100 },
  attendanceDays:               { label: 'Attendance Days',            direction: 'inverse',  unit: ' days', max: 22  },
  biometricLogs:                { label: 'Biometric Logins',           direction: 'inverse',  unit: '',      max: 30  },
  salary:                       { label: 'Monthly Salary',             direction: 'neutral',  unit: '$',     max: null },
  daysPresent:                  { label: 'Days Present',               direction: 'inverse',  unit: ' days', max: 22  },
  Days_Present:                 { label: 'Days Present',               direction: 'inverse',  unit: ' days', max: 22  },
  Monthly_Salary:               { label: 'Monthly Salary',             direction: 'neutral',  unit: '$',     max: null },
  Reconstruction_Error:         { label: 'Reconstruction Error',       direction: 'positive', unit: '',      max: 1   },
  reconstruction_error:         { label: 'Reconstruction Error',       direction: 'positive', unit: '',      max: 1   },
  salary_deviation:             { label: 'Salary Deviation',           direction: 'positive', unit: '%',     max: 200 },
  Email_Collision_Count:        { label: 'Email Collision Count',      direction: 'positive', unit: '',      max: 5   },
  Phone_Collision_Count:        { label: 'Phone Collision Count',      direction: 'positive', unit: '',      max: 5   },
  Department_Salary_Variance:   { label: 'Dept. Salary Variance',      direction: 'positive', unit: 'x',    max: 3   },
  Profile_Completeness_Percentage: { label: 'Profile Completeness',   direction: 'inverse',  unit: '%',     max: 100 },
  workloadScore:                { label: 'Workload Score',             direction: 'inverse',  unit: '',      max: 100 },
  attendanceRate:               { label: 'Attendance Rate',            direction: 'inverse',  unit: '%',     max: 100 },
  biometricMatchRate:           { label: 'Biometric Match Rate',       direction: 'inverse',  unit: '%',     max: 100 },
};

const humanise = key =>
  key.replace(/([A-Z])/g, ' $1').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()).trim();

// ─── Score ring ────────────────────────────────────────────────────────────────
const ScoreRing = ({ score }) => {
  const pct    = Math.min(100, Math.max(0, Number(score) || 0));
  const band   = getBand(pct);
  const radius = 36;
  const circ   = 2 * Math.PI * radius;
  const dash   = (pct / 100) * circ;

  return (
    <div className="flex flex-col items-center gap-1 shrink-0">
      <svg width="96" height="96" viewBox="0 0 96 96">
        {/* Track */}
        <circle cx="48" cy="48" r={radius} fill="none" stroke="#e5e7eb" strokeWidth="10" />
        {/* Score arc */}
        <circle
          cx="48" cy="48" r={radius}
          fill="none"
          stroke={band.color}
          strokeWidth="10"
          strokeDasharray={`${dash} ${circ}`}
          strokeLinecap="round"
          transform="rotate(-90 48 48)"
          style={{ transition: 'stroke-dasharray 0.6s ease' }}
        />
        {/* Score number */}
        <text x="48" y="44" textAnchor="middle" fontSize="16" fontWeight="700" fill={band.color}>
          {Math.round(pct)}
        </text>
        <text x="48" y="60" textAnchor="middle" fontSize="9" fill="#6b7280">/ 100</text>
      </svg>
      <span className="text-xs font-bold" style={{ color: band.color }}>{band.label}</span>
      <span className="text-[0.6rem] text-gray-400">Range: {band.range}</span>
    </div>
  );
};

// ─── Score range ruler ─────────────────────────────────────────────────────────
const ScoreRuler = ({ score }) => {
  const pct  = Math.min(100, Math.max(0, Number(score) || 0));
  const band = getBand(pct);
  return (
    <div className="mt-3">
      <div className="relative h-2 rounded-full overflow-hidden bg-gradient-to-r from-emerald-400 via-amber-400 to-red-500">
        <div
          className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full border-2 border-white shadow"
          style={{ left: `calc(${pct}% - 6px)`, backgroundColor: band.color, transition: 'left 0.6s ease' }}
        />
      </div>
      <div className="flex justify-between text-[0.58rem] text-gray-400 mt-0.5 px-0.5">
        <span>0 — Low</span><span>40 — Medium</span><span>70 — High — 100</span>
      </div>
    </div>
  );
};

// ─── Main component ────────────────────────────────────────────────────────────
const SHAPExplanation = ({ employee }) => {
  const features       = employee.features       || {};
  const flaggedReasons = employee.flaggedReasons  || [];
  const score          = Number(employee.anomalyScore ?? employee.Reconstruction_Error ?? employee.score ?? 0) *
                         // If the score looks like 0–1 (from ML service), scale to 0–100
                         ((employee.anomalyScore ?? 0) <= 1 && (employee.anomalyScore ?? 0) > 0 ? 100 : 1);
  const normScore      = Math.min(100, Math.max(0, score));
  const riskLevel      = employee.risk || employee.riskLevel || employee.Risk_Level || getBand(normScore).label.split(' ')[0];
  const determination  = employee.determination || null;
  const name           = employee.fullName || employee.name || null;
  const band           = getBand(normScore);
  const isHighRisk     = riskLevel === 'High' || riskLevel === 'Critical' || normScore >= 70;

  // Compute dynamic reasoning from actual employee data when determination.reasoning is absent
  const computedReasons = useMemo(() => {
    const reasons = [];
    const days    = Number(employee.attendanceDays ?? employee.Days_Present ?? employee.daysPresent ?? null);
    const sal     = Number(employee.salary ?? 0);

    if (!isNaN(days)) {
      const rate = Math.round((days / 22) * 100);
      if (days === 0)       reasons.push(`Zero attendance recorded — employee has never scanned in (0 / 22 working days).`);
      else if (days < 5)    reasons.push(`Critically low attendance rate (${rate}%) — only ${days} of 22 working days present.`);
      else if (days < 10)   reasons.push(`Below-threshold attendance (${rate}%) — ${days} of 22 working days recorded.`);
    }

    const emailCollision = employee.Email_Collision_Count ?? features?.Email_Collision_Count ?? null;
    if (emailCollision && emailCollision > 1)
      reasons.push(`Email address is shared with ${emailCollision - 1} other employee record(s) — identity duplication risk.`);

    const phoneCollision = employee.Phone_Collision_Count ?? features?.Phone_Collision_Count ?? null;
    if (phoneCollision && phoneCollision > 1)
      reasons.push(`Phone number is shared with ${phoneCollision - 1} other employee record(s) — contact information duplication.`);

    const variance = employee.Department_Salary_Variance ?? features?.Department_Salary_Variance ?? null;
    if (variance && variance > 0.8)
      reasons.push(`Salary is ${Math.round(variance * 100)}% above the departmental mean — significant deviation detected.`);
    else if (variance && variance > 0.4)
      reasons.push(`Salary deviates ${Math.round(variance * 100)}% from the departmental mean.`);

    const completeness = employee.Profile_Completeness_Percentage ?? features?.Profile_Completeness_Percentage ?? null;
    if (completeness !== null && completeness < 60)
      reasons.push(`Profile completeness is only ${Math.round(completeness)}% — critical identity fields are missing.`);
    else if (completeness !== null && completeness < 80)
      reasons.push(`Profile is ${Math.round(completeness)}% complete — some identity markers are absent.`);

    return reasons;
  }, [employee, features, isHighRisk]);

  // Build a specific prose summary from actual employee data rather than a generic template
  const dynamicSummary = useMemo(() => {
    const s = Math.round(normScore);
    const nameStr = name || 'This employee';
    const findings = [];

    // Attendance
    const rawDays = employee.attendanceDays ?? employee.Days_Present ?? employee.daysPresent ?? null;
    const days = rawDays != null ? Number(rawDays) : NaN;
    if (!isNaN(days)) {
      const rate = Math.round((days / 22) * 100);
      if (days === 0)
        findings.push('zero attendance days recorded in the current period');
      else if (days < 5)
        findings.push(`critically low attendance — only ${days} of 22 working days present (${rate}%)`);
      else if (days < 10)
        findings.push(`below-threshold attendance — ${days} of 22 working days recorded (${rate}%)`);
    }

    // Email collision
    const emailCol = employee.Email_Collision_Count ?? features?.Email_Collision_Count ?? null;
    if (emailCol && Number(emailCol) > 1)
      findings.push(`email address shared with ${Number(emailCol) - 1} other employee record${Number(emailCol) - 1 > 1 ? 's' : ''}`);

    // Phone collision
    const phoneCol = employee.Phone_Collision_Count ?? features?.Phone_Collision_Count ?? null;
    if (phoneCol && Number(phoneCol) > 1)
      findings.push(`phone number shared with ${Number(phoneCol) - 1} other employee record${Number(phoneCol) - 1 > 1 ? 's' : ''}`);

    // Salary deviation from department mean
    const variance = employee.Department_Salary_Variance ?? features?.Department_Salary_Variance ?? null;
    if (variance != null && Number(variance) > 0.8) {
      const sal = Number(employee.salary ?? 0);
      const salStr = sal > 0 ? ` ($${sal.toLocaleString()})` : '';
      findings.push(`salary${salStr} is ${Math.round(Number(variance) * 100)}% above the ${employee.department || 'department'} mean`);
    } else if (variance != null && Number(variance) > 0.4) {
      findings.push(`salary deviates ${Math.round(Number(variance) * 100)}% from the departmental mean`);
    }

    // Profile completeness
    const completeness = employee.Profile_Completeness_Percentage ?? features?.Profile_Completeness_Percentage ?? null;
    if (completeness != null && Number(completeness) < 60)
      findings.push(`profile completeness is only ${Math.round(Number(completeness))}% — critical identity fields are missing`);
    else if (completeness != null && Number(completeness) < 80)
      findings.push(`profile is ${Math.round(Number(completeness))}% complete — some identity markers are absent`);

    if (normScore < 40) {
      if (findings.length === 0)
        return `Score ${s}/100 is within the normal range. ${nameStr}'s profile shows no significant ghost-employee indicators — attendance, salary, and identity fields are consistent with an active, legitimate employee.`;
      const findingStr = findings.map((f, i) => i === 0 ? f[0].toUpperCase() + f.slice(1) : f).join('. ') + '.';
      return `Score ${s}/100 is within the normal range. Note: ${findingStr}`;
    }

    if (findings.length === 0) {
      return normScore >= 70
        ? `Score ${s}/100 is in the critical anomaly zone. ${nameStr} exhibits strong ghost-employee signals. Immediate investigation and payroll suspension are recommended pending verification.`
        : `Score ${s}/100 places ${nameStr} in the moderate anomaly zone. A targeted audit is recommended before payroll confirmation.`;
    }

    const cap = f => f[0].toUpperCase() + f.slice(1);
    const findingStr = findings.map((f, i) => i === 0 ? cap(f) : f).join('. ') + '.';
    const action = normScore >= 70
      ? 'Immediate investigation and payroll suspension are recommended.'
      : 'A targeted audit is recommended before payroll confirmation.';

    return `Score ${s}/100 — ${findingStr} ${action}`;
  }, [normScore, name, employee, features]);

  // Prefer determination.reasoning (from ML service) if it has meaningful content; else use computed
  const activeReasons = useMemo(() => {
    const detReasons = determination?.reasoning?.filter(r => r && r.length > 5) || [];
    if (detReasons.length > 0) return detReasons;
    if (computedReasons.length > 0) return computedReasons;
    return flaggedReasons;
  }, [determination, computedReasons, flaggedReasons]);

  // Feature bars — built from features object or from known employee fields
  const featureBars = useMemo(() => {
    const src = { ...features };
    // Supplement from top-level employee fields if features object is sparse
    if (employee.salary          != null) src.salary               = employee.salary;
    if (employee.attendanceDays  != null) src.attendanceDays       = employee.attendanceDays;
    if (employee.Days_Present    != null) src.Days_Present         = employee.Days_Present;
    if (employee.biometricLogs   != null) src.biometricLogs        = employee.biometricLogs;

    return Object.entries(src)
      .filter(([, v]) => v !== null && v !== undefined && typeof v === 'number')
      .map(([key, rawValue]) => {
        const meta      = FEATURE_META[key] || {};
        const direction = meta.direction || 'neutral';
        const unit      = meta.unit      || '';
        const label     = meta.label     || humanise(key);
        const maxNorm   = meta.max       || 100;

        let contribution;
        if (direction === 'positive') {
          contribution = Math.min(1, Math.abs(rawValue) / maxNorm);
        } else if (direction === 'inverse') {
          contribution = Math.max(0, 1 - rawValue / maxNorm);
        } else {
          // neutral: show proportional bar against dataset salary range ($300–$10000)
          const salRange = 9700;
          contribution = Math.min(1, rawValue / salRange);
        }

        const isBad =
          direction === 'positive' ? rawValue > maxNorm * 0.5 :
          direction === 'inverse'  ? rawValue < maxNorm * 0.3 :
          false;

        return { key, label, rawValue, unit, direction, contribution, isBad };
      })
      .sort((a, b) => b.contribution - a.contribution)
      .slice(0, 7);
  }, [features, employee]);

  const hasFeatures = featureBars.length > 0;
  const hasReasons  = activeReasons.length > 0;
  const confidence = determination?.confidence ?? null;

  if (!normScore && !hasReasons && !hasFeatures) return null;

  return (
    <div className="space-y-5">

      {/* ── Score header card ── */}
      <div className={`flex items-start gap-4 p-4 rounded-xl border ${band.bg} ${band.border}`}>
        <ScoreRing score={normScore} />
        <div className="flex-1 min-w-0">
          <p className="text-[0.68rem] font-bold uppercase tracking-widest text-gray-500 mb-1">
            ML Anomaly Score
          </p>
          {/* Classification derived from the same band as the ring — always consistent */}
          <p className={`text-xs font-bold mb-1 ${band.textColor}`}>{band.classification}</p>
          <p className={`text-sm leading-relaxed ${band.subText}`}>
            {dynamicSummary}
          </p>
          {confidence !== null && (
            <p className="text-[0.65rem] text-gray-500 mt-1.5">
              Model confidence: <span className="font-semibold text-gray-700">{confidence}%</span>
            </p>
          )}
          <ScoreRuler score={normScore} />
        </div>
      </div>

      {/* ── Determination reasoning ── */}
      {hasReasons && (
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-2 flex items-center gap-2">
            {isHighRisk
              ? <AlertCircle className="w-3.5 h-3.5 text-red-500" />
              : <Info className="w-3.5 h-3.5 text-amber-500" />}
            {isHighRisk ? 'Anomaly Indicators' : normScore >= 40 ? 'Review Points' : 'Audit Notes'}
          </p>
          <ul className="space-y-2">
            {activeReasons.map((reason, idx) => (
              <li key={idx} className="flex items-start gap-2 text-xs">
                {isHighRisk
                  ? <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-red-500" />
                  : normScore >= 40
                  ? <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber-500" />
                  : <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5 text-emerald-500" />}
                <span className="text-gray-700 leading-snug">{reason}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ── Low risk — all-clear note ── */}
      {!isHighRisk && normScore < 40 && !hasReasons && (
        <div className="flex items-center gap-2 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
          <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-500" />
          All monitored indicators are within normal parameters. No ghost-employee patterns detected.
        </div>
      )}

      {/* ── Feature bars ── */}
      {hasFeatures && (
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-3 flex items-center gap-2">
            Feature Contributions
            <span className="font-normal normal-case text-gray-400">— which data points influenced this score</span>
          </p>
          <div className="space-y-2.5">
            {featureBars.map(({ key, label, rawValue, unit, contribution, isBad, direction }) => {
              const barPct   = Math.max(3, Math.round(contribution * 100));
              const barColor = direction === 'neutral' ? 'bg-slate-300' : isBad ? 'bg-red-400' : 'bg-emerald-400';
              const Icon     = direction === 'neutral' ? Minus : isBad ? TrendingUp : TrendingDown;
              const iconCol  = direction === 'neutral' ? 'text-slate-400' : isBad ? 'text-red-500' : 'text-emerald-500';

              const displayVal = unit === '$'
                ? `$${Number(rawValue).toLocaleString()}`
                : unit === 'x'
                ? `${rawValue.toFixed(2)}x`
                : `${typeof rawValue === 'number' ? rawValue.toFixed(rawValue < 10 ? 2 : 0) : rawValue}${unit}`;

              return (
                <div key={key}>
                  <div className="flex items-center justify-between mb-0.5">
                    <div className="flex items-center gap-1.5">
                      <Icon className={`w-3 h-3 shrink-0 ${iconCol}`} />
                      <span className="text-[0.68rem] text-gray-600">{label}</span>
                    </div>
                    <span className={`text-[0.65rem] font-mono font-semibold ${isBad ? 'text-red-600' : 'text-emerald-700'}`}>
                      {displayVal}
                    </span>
                  </div>
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${barColor}`}
                      style={{ width: `${barPct}%`, transition: 'width 0.5s ease' }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex items-center gap-4 mt-2.5 text-[0.6rem] text-gray-400">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-400 inline-block" /> Pushes toward anomaly</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" /> Normal indicator</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-slate-300 inline-block" /> Contextual</span>
          </div>
        </div>
      )}

      {/* ── Model audit info ── */}
      {employee.modelInfo && (
        <div className="text-[0.65rem] text-gray-400 border-t border-gray-100 pt-3 space-y-0.5">
          <p><span className="font-medium text-gray-500">Model:</span> {employee.modelInfo.name}</p>
          <p><span className="font-medium text-gray-500">Contamination:</span> {employee.modelInfo.contamination}</p>
          <p><span className="font-medium text-gray-500">Prediction:</span> {employee.modelInfo.prediction}</p>
        </div>
      )}
    </div>
  );
};

export default SHAPExplanation;
