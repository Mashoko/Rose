import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const execAsync = promisify(exec);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.set('trust proxy', 1);
// Increase payload size limit to handle potentially large CSV result arrays
const corsOrigins = (process.env.CORS_ORIGIN || 'http://localhost:5173,http://localhost:5174')
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean);
app.use(cors({
    origin(origin, callback) {
        if (!origin || corsOrigins.includes(origin)) return callback(null, true);
        return callback(new ApiError(403, 'CORS origin is not allowed', 'CORS_FORBIDDEN'));
    }
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Connection string from environment variables
const MONGO_URI = process.env.MONGO_URI;

mongoose.connect(MONGO_URI)
    .then(() => console.log('MongoDB Connected'))
    .catch(err => console.error('MongoDB Connection Error:', err));

// Models are now imported
import Employee from './api/src/models/Employee.js';
import User from './api/src/models/User.js';
import AuditLog from './api/src/models/AuditLog.js';
import ReportBatch from './api/src/models/ReportBatch.js';
import ReportRecord from './api/src/models/ReportRecord.js';
import SystemSettings, { getSettings } from './api/src/models/SystemSettings.js';
import RateLimit from './api/src/models/RateLimit.js';

const ROLES = Object.freeze({
    ADMIN: 'Admin',
    AUDITOR: 'Auditor',
    HR: 'HR Officer',
    FINANCE: 'Finance Officer'
});

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '1h';
const SERVICE_API_KEY = process.env.INTERNAL_SERVICE_API_KEY;
const AUTH_BOOTSTRAP_TOKEN = process.env.AUTH_BOOTSTRAP_TOKEN;
const LOGIN_WINDOW_MS = Number(process.env.LOGIN_RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000);
const LOGIN_MAX_ATTEMPTS = Number(process.env.LOGIN_RATE_LIMIT_MAX_ATTEMPTS || 5);

class ApiError extends Error {
    constructor(statusCode, message, code = 'API_ERROR') {
        super(message);
        this.statusCode = statusCode;
        this.code = code;
    }
}

const asyncHandler = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);

const getClientIp = (req) => req.ip || req.socket?.remoteAddress || req.connection?.remoteAddress || 'unknown';

const recordAudit = async (req, action, options = {}) => {
    try {
        await AuditLog.create({
            action,
            actorId: req.user?._id,
            actorUsername: req.user?.username || req.servicePrincipal?.username,
            actorRole: req.user?.role || req.servicePrincipal?.role,
            status: options.status || 'success',
            resourceType: options.resourceType,
            resourceId: options.resourceId,
            ip: getClientIp(req),
            userAgent: req.get('user-agent'),
            metadata: options.metadata
        });
    } catch (err) {
        console.error('Audit log write failed:', err.message);
    }
};

const authenticate = asyncHandler(async (req, res, next) => {
    const authHeader = req.get('authorization') || '';
    const [scheme, headerToken] = authHeader.split(' ');
    const queryToken = typeof req.query?.access_token === 'string' ? req.query.access_token : undefined;
    const token = headerToken || queryToken;

    if (((!scheme || scheme.toLowerCase() !== 'bearer') && !queryToken) && SERVICE_API_KEY) {
        const serviceToken = req.get('x-service-token');
        if (serviceToken && serviceToken === SERVICE_API_KEY) {
            req.servicePrincipal = {
                username: 'internal-service',
                role: ROLES.ADMIN
            };
            return next();
        }
    }

    if (((!scheme || scheme.toLowerCase() !== 'bearer') && !queryToken) || !token) {
        throw new ApiError(401, 'Authentication token is required', 'AUTH_TOKEN_MISSING');
    }

    if (!JWT_SECRET) {
        throw new ApiError(500, 'JWT_SECRET is not configured', 'JWT_SECRET_MISSING');
    }

    try {
        const payload = jwt.verify(token, JWT_SECRET);
        const user = await User.findById(payload.id).select('_id username role isActive');
        if (!user || user.isActive === false) {
            throw new ApiError(401, 'User is inactive or no longer exists', 'AUTH_USER_INVALID');
        }
        req.user = user;
        return next();
    } catch (err) {
        if (err instanceof ApiError) throw err;
        const message = err.name === 'TokenExpiredError' ? 'Authentication token has expired' : 'Invalid authentication token';
        throw new ApiError(401, message, 'AUTH_TOKEN_INVALID');
    }
});

const authorize = (...allowedRoles) => (req, res, next) => {
    const role = req.user?.role || req.servicePrincipal?.role;
    if (!role) {
        return next(new ApiError(401, 'Authentication is required', 'AUTH_REQUIRED'));
    }
    if (role === ROLES.ADMIN || allowedRoles.includes(role)) {
        return next();
    }
    return next(new ApiError(403, 'You do not have permission to perform this action', 'RBAC_FORBIDDEN'));
};

const requireFields = (...fields) => (req, res, next) => {
    const missing = fields.filter((field) => req.body?.[field] === undefined || req.body?.[field] === null || req.body?.[field] === '');
    if (missing.length > 0) {
        return next(new ApiError(400, `Missing required field(s): ${missing.join(', ')}`, 'VALIDATION_ERROR'));
    }
    return next();
};

const getLoginAttemptKey = (req, username = '') => `${getClientIp(req)}:${String(username).toLowerCase()}`;

// In-memory rate limiting (survives within a process session; reliable on all tiers).
const _loginAttempts = new Map();

const enforceLoginRateLimit = async (req, username) => {
    const key = getLoginAttemptKey(req, username);
    const now = Date.now();
    const current = _loginAttempts.get(key);
    if (current && current.resetAt > now && current.count >= LOGIN_MAX_ATTEMPTS) {
        throw new ApiError(429, 'Too many login attempts. Please try again later.', 'LOGIN_RATE_LIMITED');
    }
};

const registerFailedLogin = async (req, username) => {
    const key = getLoginAttemptKey(req, username);
    const now = Date.now();
    const current = _loginAttempts.get(key);
    if (current && current.resetAt > now) {
        current.count += 1;
    } else {
        _loginAttempts.set(key, { count: 1, resetAt: now + LOGIN_WINDOW_MS });
    }
};

const clearLoginAttempts = async (req, username) => {
    _loginAttempts.delete(getLoginAttemptKey(req, username));
};

// Analysis Report Schema
const ReportSchema = new mongoose.Schema({
    reportName: { type: String, default: "Analysis Report" },
    date: { type: Date, default: Date.now },
    summary: {
        totalAnalyzed: Number,
        highRiskCount: Number,
        mediumRiskCount: Number,
        lowRiskCount: Number,
        totalExposure: { type: Number, default: 0 }
    },
    // We can store a snapshot of the high/medium risk records natively, or all of them.
    // Storing all might become huge, but is requested for full history.
    details: [mongoose.Schema.Types.Mixed]
}, { timestamps: true });

const Report = mongoose.model('Report', ReportSchema);

// Historical records schema (now tied to individual employee by ID)
const HistorySchema = new mongoose.Schema({
    employeeId: { type: String, required: true },
    month: String,
    attendance: Number,
    riskScore: Number,
    status: String
}, { timestamps: true });
const History = mongoose.model('History', HistorySchema);

// SSE Clients Array
let clients = [];

// Heartbeat: write a keep-alive comment every 25 s and remove dead connections.
// Without this, stale TCP connections never fire the 'close' event and the
// clients array grows indefinitely.
const sseHeartbeat = setInterval(() => {
    clients = clients.filter(client => {
        try {
            client.res.write(': heartbeat\n\n');
            return true;
        } catch {
            return false; // socket already closed — drop it
        }
    });
}, 25000);
sseHeartbeat.unref(); // don't block process exit

// Helper to broadcast to all SSE clients
const broadcastNewReportEvent = () => {
    clients.forEach(client => {
        try {
            client.res.write(`data: ${JSON.stringify({ event: 'new_report', timestamp: Date.now() })}\n\n`);
        } catch {
            // dead client — heartbeat will clean it up next cycle
        }
    });
};


// Routes
app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

// Dataset information (local CSVs)
app.get('/api/dataset-info', authenticate, authorize(ROLES.AUDITOR, ROLES.HR, ROLES.FINANCE), asyncHandler(async (req, res) => {
    try {
        const fs = await import('fs');
        const path = await import('path');
        const base = path.resolve('./');
        const files = ['test_data.csv', 'test_data2.csv', 'test_employees.csv', 'reproduce_issue.csv'];
        const info = files.map(f => {
            const p = path.join(base, f);
            try {
                const stats = fs.statSync(p);
                return { name: f, size: stats.size };
            } catch {
                return { name: f, error: 'not found' };
            }
        });
        res.json(info);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
}));

// Create a new employee (from fingerprint dashboard or HR)
app.post('/api/employees', authenticate, authorize(ROLES.HR), asyncHandler(async (req, res) => {
    const { fullName, department, email, salary, employeeId, contractType, nationalId } = req.body;
    if (!fullName?.trim() || !department?.trim()) {
        return res.status(400).json({ error: 'fullName and department are required' });
    }
    const empId = employeeId?.trim() || `EMP-${Date.now().toString(36).toUpperCase().slice(-6)}`;
    const orClauses = [{ employeeId: empId }];
    if (email?.trim()) orClauses.push({ email: email.trim() });
    const existing = await Employee.findOne({ $or: orClauses });
    if (existing) {
        return res.status(409).json({
            error: existing.employeeId === empId ? 'Employee ID already exists' : 'Email already registered to another employee'
        });
    }
    const employee = new Employee({
        employeeId: empId,
        fullName: fullName.trim(),
        department: department.trim(),
        email: email?.trim() || undefined,
        salary: salary ? Number(salary) : undefined,
        nationalId: nationalId?.trim() || undefined,
        contractType: contractType || 'Full-Time',
        employmentStatus: 'Active',
        riskLevel: 'Low',
        attendanceDays: 0,
        biometricLogs: 0,
        status: 'Pending',
    });
    await employee.save();
    await recordAudit(req, 'EMPLOYEE_CREATED', {
        resourceType: 'employee',
        resourceId: employee.employeeId,
        metadata: { source: 'fingerprint_dashboard', department: employee.department }
    });
    res.status(201).json(employee);
}));

// Manual attendance mark — HR can mark present without a fingerprint scan (e.g. hardware fault)
app.post('/api/attendance/manual', authenticate, authorize(ROLES.HR), requireFields('employeeId'), asyncHandler(async (req, res) => {
    const { employeeId } = req.body;
    const employee = await Employee.findOne({ employeeId });
    if (!employee) return res.status(404).json({ error: 'Employee not found' });
    const today = new Date().toLocaleDateString('en-CA');
    const alreadyToday = employee.lastAttendanceDate === today;
    employee.lastActive = new Date();
    if (!alreadyToday) {
        employee.lastAttendanceDate = today;
        employee.attendanceDays = (employee.attendanceDays || 0) + 1;
    }
    await employee.save();
    if (!alreadyToday) {
        await new History({
            employeeId: employee.employeeId,
            month: new Date().toLocaleString('default', { month: 'long' }),
            attendance: employee.attendanceDays,
            riskScore: employee.anomalyScore,
            status: 'Present'
        }).save();
    }
    await recordAudit(req, 'ATTENDANCE_MANUAL_MARK', {
        resourceType: 'employee',
        resourceId: employee.employeeId,
        metadata: { alreadyPresentToday: alreadyToday }
    });
    res.json({
        message: alreadyToday ? `Already marked today for ${employee.fullName}` : `Attendance marked for ${employee.fullName}`,
        employee,
        alreadyPresentToday: alreadyToday
    });
}));

// Get employees — supports optional pagination via ?page=1&limit=50
app.get('/api/employees', authenticate, authorize(ROLES.AUDITOR, ROLES.HR, ROLES.FINANCE), asyncHandler(async (req, res) => {
    const { page, limit, department, risk, status, search } = req.query;

    const filter = {};
    if (department) filter.department = department;
    if (risk)       filter.riskLevel  = risk;
    if (status)     filter.status     = status;
    if (search) {
        const re = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
        filter.$or = [{ fullName: re }, { employeeId: re }, { department: re }];
    }

    const sort = { anomalyScore: -1 };

    if (page !== undefined || limit !== undefined) {
        const pageNum  = Math.max(1, parseInt(page,  10) || 1);
        const limitNum = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));
        const skip     = (pageNum - 1) * limitNum;
        const [data, total] = await Promise.all([
            Employee.find(filter).sort(sort).skip(skip).limit(limitNum),
            Employee.countDocuments(filter),
        ]);
        const pages = Math.ceil(total / limitNum);
        return res.json({
            data,
            pagination: { total, page: pageNum, limit: limitNum, pages, hasNext: pageNum < pages, hasPrev: pageNum > 1 }
        });
    }

    // Unpaginated fallback — existing callers get a plain array
    const employees = await Employee.find(filter).sort(sort);
    res.json(employees);
}));

// Update employee case status
app.patch('/api/employees/:id/status', authenticate, authorize(ROLES.AUDITOR, ROLES.HR), requireFields('status'), asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;

    const validStatuses = ['Pending', 'Under Investigation', 'False Positive', 'Confirmed Ghost'];
    if (!validStatuses.includes(status)) {
        throw new ApiError(400, 'Invalid status value', 'VALIDATION_ERROR');
    }

    const employee = await Employee.findOneAndUpdate(
        { employeeId: id },
        { status: status },
        { new: true }
    );

    if (!employee) {
        // Fallback: try by MongoDB _id just in case
        const empById = await Employee.findByIdAndUpdate(id, { status }, { new: true });
        if (!empById) throw new ApiError(404, 'Employee not found', 'EMPLOYEE_NOT_FOUND');
        await recordAudit(req, 'ANOMALY_REVIEW_UPDATED', {
            resourceType: 'employee',
            resourceId: id,
            metadata: { status }
        });
        return res.json(empById);
    }

    await recordAudit(req, 'ANOMALY_REVIEW_UPDATED', {
        resourceType: 'employee',
        resourceId: employee.employeeId || id,
        metadata: { status }
    });
    res.json(employee);
}));

// ==== Reports Routes ====
app.post('/api/reports', authenticate, authorize(ROLES.AUDITOR, ROLES.FINANCE), requireFields('summary', 'details'), asyncHandler(async (req, res) => {
    const { summary, details, reportName } = req.body;
    const newReport = new Report({
        reportName: reportName || `Analysis Run - ${new Date().toLocaleString()}`,
        summary,
        details
    });
    const savedReport = await newReport.save();

    await recordAudit(req, 'REPORT_CREATED', {
        resourceType: 'report',
        resourceId: savedReport._id.toString(),
        metadata: { reportName: savedReport.reportName }
    });

    // Notify any active dashboard clients about the new report
    broadcastNewReportEvent();

    res.status(201).json(savedReport);
}));

app.get('/api/reports', authenticate, authorize(ROLES.AUDITOR, ROLES.FINANCE, ROLES.HR), asyncHandler(async (req, res) => {
    // Exclude the 'details' array in the list view to save massive bandwidth.
    // It can be fetched by ID later if needed, but for the table, we just need summary data.
    const reports = await Report.find({}, '-details').sort({ date: -1 });
    res.json(reports);
}));

app.get('/api/reports/:id', authenticate, authorize(ROLES.AUDITOR, ROLES.FINANCE, ROLES.HR), asyncHandler(async (req, res) => {
    const report = await Report.findById(req.params.id);
    if (!report) throw new ApiError(404, 'Report not found', 'REPORT_NOT_FOUND');
    res.json(report);
}));

// === Historical Data Route ===
// Accepts optional ?employeeId= to filter records per employee
// Returns only real records from the database; no demo placeholders.
app.get('/api/history', authenticate, authorize(ROLES.AUDITOR, ROLES.HR, ROLES.FINANCE), asyncHandler(async (req, res) => {
    const { employeeId } = req.query;
    const filter = {};
    if (employeeId) filter.employeeId = employeeId;
    const records = await History.find(filter).sort({ _id: 1 });
    return res.json({ data: records });
}));

// CSV download endpoint
app.get('/api/history/csv', authenticate, authorize(ROLES.AUDITOR, ROLES.HR, ROLES.FINANCE), asyncHandler(async (req, res) => {
    try {
        const { employeeId } = req.query;
        const filter = {};
        if (employeeId) filter.employeeId = employeeId;

        const records = await History.find(filter).sort({ _id: 1 });

        // build CSV string with proper formatting
        const header = ['Month', 'Attendance', 'Risk Score', 'Status'];
        const rows = (records || []).map(r => [
            r.month || '',
            r.attendance || 0,
            (r.riskScore || 0).toFixed(2),
            r.status || ''
        ]);

        const csv = [header, ...rows]
            .map(r => r.map(cell => {
                // Escape cells containing commas or quotes
                if (typeof cell === 'string' && (cell.includes(',') || cell.includes('"'))) {
                    return `"${cell.replace(/"/g, '""')}"`;
                }
                return cell;
            }).join(','))
            .join('\n');

        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="history_${employeeId || 'all'}_${Date.now()}.csv"`);
        await recordAudit(req, 'REPORT_EXPORT', {
            resourceType: 'history',
            resourceId: employeeId || 'all',
            metadata: { format: 'csv' }
        });
        res.send(csv);
    } catch (err) {
        console.error('CSV endpoint error:', err);
        res.status(500).json({ error: 'Failed to generate CSV', message: err.message });
    }
}));

// Real-Time SSE Endpoint
app.get('/api/stream/reports', authenticate, authorize(ROLES.AUDITOR, ROLES.FINANCE, ROLES.HR), (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const clientId = Date.now();
    const newClient = { id: clientId, res };
    clients.push(newClient);

    req.on('close', () => {
        clients = clients.filter(client => client.id !== clientId);
    });
});

// ==== Fingerprint Routes ====

// ENROLLMENT: Link an AS608 fingerprint template ID to an existing employee
app.patch('/api/employees/enroll-fingerprint', authenticate, authorize(ROLES.HR), requireFields('employeeId', 'fingerprintId'), asyncHandler(async (req, res) => {
    try {
        const { employeeId, fingerprintId } = req.body;

        const employee = await Employee.findOneAndUpdate(
            { employeeId },
            { fingerprintId },
            { new: true }
        );

        if (!employee) return res.status(404).json({ error: 'Employee not found' });
        await recordAudit(req, 'EMPLOYEE_FINGERPRINT_ENROLLED', {
            resourceType: 'employee',
            resourceId: employee.employeeId,
            metadata: { fingerprintId }
        });
        res.json({ message: 'Fingerprint enrolled successfully', employee });
    } catch (err) {
        // Duplicate key error (fingerprintId already assigned to another employee)
        if (err.code === 11000) {
            return res.status(409).json({ error: 'This fingerprint ID is already enrolled to another employee' });
        }
        res.status(500).json({ error: err.message });
    }
}));

// ENROLLMENT (email lookup): link a fingerprint slot to an employee found by email.
// Called by the frontend after the Flask fingerprint service registers the user,
// so the MongoDB employee record also carries the fingerprintId for attendance scans.
app.patch('/api/employees/enroll-fingerprint-by-email', authenticate, authorize(ROLES.HR), requireFields('email', 'fingerprintId'), asyncHandler(async (req, res) => {
    const { email, fingerprintId } = req.body;
    const fpId = Number(fingerprintId);
    if (!Number.isFinite(fpId) || fpId < 0) {
        throw new ApiError(400, 'fingerprintId must be a non-negative integer', 'VALIDATION_ERROR');
    }

    let employee = await Employee.findOneAndUpdate(
        { email },
        { fingerprintId: fpId },
        { new: true }
    );

    if (!employee) {
        throw new ApiError(404, 'No employee found with that email address. Enroll them via the Analysis page first.', 'EMPLOYEE_NOT_FOUND');
    }

    await recordAudit(req, 'EMPLOYEE_FINGERPRINT_ENROLLED', {
        resourceType: 'employee',
        resourceId: employee.employeeId,
        metadata: { fingerprintId: fpId, method: 'email-lookup' }
    });

    res.json({ message: 'Fingerprint linked to employee record', employee });
}));

// ATTENDANCE: Mark present when a finger is scanned by the Pico W / Python bridge
app.post('/api/attendance/scan', authenticate, authorize(ROLES.HR), requireFields('fingerprintId'), asyncHandler(async (req, res) => {
    try {
        const { fingerprintId } = req.body;

        const employee = await Employee.findOne({ fingerprintId });
        if (!employee) return res.status(404).json({ error: 'Fingerprint not recognized' });

        // One counted present per local calendar day (YYYY-MM-DD)
        const today = new Date().toLocaleDateString('en-CA');
        const alreadyToday = employee.lastAttendanceDate === today;

        employee.biometricLogs = (employee.biometricLogs || 0) + 1;
        employee.lastActive = new Date();

        if (alreadyToday) {
            await employee.save();
            await recordAudit(req, 'ATTENDANCE_SCAN_RECORDED', {
                resourceType: 'employee',
                resourceId: employee.employeeId,
                metadata: { fingerprintId, alreadyPresentToday: true }
            });
            return res.json({
                message: `Already marked present today for ${employee.fullName}`,
                employee,
                alreadyPresentToday: true
            });
        }

        employee.lastAttendanceDate = today;
        employee.attendanceDays = (employee.attendanceDays || 0) + 1;
        await employee.save();

        const newHistory = new History({
            employeeId: employee.employeeId,
            month: new Date().toLocaleString('default', { month: 'long' }),
            attendance: employee.attendanceDays,
            riskScore: employee.anomalyScore,
            status: 'Present'
        });
        await newHistory.save();

        await recordAudit(req, 'ATTENDANCE_SCAN_RECORDED', {
            resourceType: 'employee',
            resourceId: employee.employeeId,
            metadata: { fingerprintId, alreadyPresentToday: false }
        });

        res.json({
            message: `Attendance marked for ${employee.fullName}`,
            employee,
            alreadyPresentToday: false
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
}));

// Get employees that have a fingerprintId enrolled
app.get('/api/employees/enrolled', authenticate, authorize(ROLES.AUDITOR, ROLES.HR, ROLES.FINANCE), asyncHandler(async (req, res) => {
    const employees = await Employee.find({ fingerprintId: { $ne: null, $exists: true } })
        .select('employeeId fullName email department fingerprintId riskLevel anomalyScore attendanceDays lastActive lastAttendanceDate')
        .sort({ fullName: 1 });
    res.json(employees);
}));

// Recent attendance scans — employees sorted by lastActive desc, within last 24 hours
app.get('/api/attendance/recent', authenticate, authorize(ROLES.AUDITOR, ROLES.HR, ROLES.FINANCE), asyncHandler(async (req, res) => {
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const employees = await Employee.find({ lastActive: { $gte: since }, fingerprintId: { $exists: true, $ne: null } })
        .select('employeeId fullName department riskLevel lastActive lastAttendanceDate attendanceDays fingerprintId')
        .sort({ lastActive: -1 })
        .limit(limit)
        .lean();
    res.json(employees);
}));

// ATTENDANCE VERIFY: Identify employee from a fingerprint scan without marking attendance.
// Used by the frontend to show who scanned before committing the attendance record.
app.get('/api/attendance/verify', authenticate, authorize(ROLES.HR, ROLES.AUDITOR), asyncHandler(async (req, res) => {
    const fpId = Number(req.query.fingerprintId);
    if (!Number.isFinite(fpId)) {
        return res.status(400).json({ error: 'fingerprintId query param required (integer)' });
    }
    const employee = await Employee.findOne({ fingerprintId: fpId }).select(
        'employeeId fullName department riskLevel anomalyScore biometricLogs lastAttendanceDate fingerprintId'
    );
    if (!employee) {
        return res.json({ verified: false, message: 'No employee matched this fingerprint ID' });
    }
    const today = new Date().toLocaleDateString('en-CA');
    res.json({
        verified: true,
        alreadyPresentToday: employee.lastAttendanceDate === today,
        employee: {
            employeeId:       employee.employeeId,
            fullName:         employee.fullName,
            department:       employee.department,
            riskLevel:        employee.riskLevel,
            anomalyScore:     employee.anomalyScore,
            biometricLogs:    employee.biometricLogs,
            fingerprintId:    employee.fingerprintId,
        }
    });
}));

// Auth Routes
app.post('/api/auth/login', asyncHandler(async (req, res) => {
    const { username, password } = req.body;
    if (typeof username !== 'string' || typeof password !== 'string' || !username.trim() || !password) {
        throw new ApiError(400, 'Username and password are required', 'VALIDATION_ERROR');
    }

    await enforceLoginRateLimit(req, username);

    const user = await User.findOne({ username: username.trim() });
    if (!user || user.isActive === false) {
        await registerFailedLogin(req, username);
        await recordAudit(req, 'LOGIN_ATTEMPT', {
            status: 'failure',
            metadata: { username: username.trim(), reason: 'invalid_credentials' }
        });
        throw new ApiError(401, 'Invalid credentials', 'AUTH_INVALID_CREDENTIALS');
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
        await registerFailedLogin(req, username);
        await recordAudit(req, 'LOGIN_ATTEMPT', {
            status: 'failure',
            metadata: { username: username.trim(), reason: 'invalid_credentials' }
        });
        throw new ApiError(401, 'Invalid credentials', 'AUTH_INVALID_CREDENTIALS');
    }

    if (!JWT_SECRET) {
        throw new ApiError(500, 'JWT_SECRET is not configured', 'JWT_SECRET_MISSING');
    }

    user.lastLoginAt = new Date();
    await user.save();
    await clearLoginAttempts(req, username);

    const token = jwt.sign(
        { id: user._id, username: user.username, role: user.role },
        JWT_SECRET
    );

    req.user = user;
    await recordAudit(req, 'LOGIN_ATTEMPT', {
        status: 'success',
        metadata: { username: user.username }
    });

    res.json({ token, user: { username: user.username, role: user.role } });
}));

const bootstrapInitialAdmin = asyncHandler(async (req, res) => {
    if (!AUTH_BOOTSTRAP_TOKEN || req.get('x-setup-token') !== AUTH_BOOTSTRAP_TOKEN) {
        throw new ApiError(404, 'Bootstrap endpoint is not available', 'BOOTSTRAP_UNAVAILABLE');
    }

    const existingUserCount = await User.countDocuments();
    if (existingUserCount > 0) {
        throw new ApiError(409, 'Bootstrap is only allowed before users exist', 'BOOTSTRAP_LOCKED');
    }

    const username = process.env.INITIAL_ADMIN_USERNAME;
    const password = process.env.INITIAL_ADMIN_PASSWORD;
    if (!username || !password) {
        throw new ApiError(500, 'INITIAL_ADMIN_USERNAME and INITIAL_ADMIN_PASSWORD must be configured', 'BOOTSTRAP_CONFIG_MISSING');
    }

    const salt = await bcrypt.genSalt(12);
    const hashedPassword = await bcrypt.hash(password, salt);

    const newUser = new User({
        username,
        password: hashedPassword,
        role: ROLES.ADMIN
    });
    await newUser.save();

    await recordAudit(req, 'ADMIN_BOOTSTRAPPED', {
        resourceType: 'user',
        resourceId: newUser._id.toString(),
        metadata: { username }
    });

    res.status(201).json({ message: 'Initial admin user created successfully' });
});

app.post('/api/auth/bootstrap', bootstrapInitialAdmin);
app.post('/api/auth/seed', (req, res, next) => {
    next(new ApiError(410, 'Use /api/auth/bootstrap with AUTH_BOOTSTRAP_TOKEN instead', 'SEED_DISABLED'));
});

// --- Fingerprint USB bridge control (local dev only; see ENABLE_FINGERPRINT_BRIDGE_CONTROL) ---
function bridgeControlAuth(req) {
    const raw = process.env.ENABLE_FINGERPRINT_BRIDGE_CONTROL;
    const flag = String(raw ?? '')
        .trim()
        .replace(/\r$/, '')
        .toLowerCase();
    if (flag !== 'true' && flag !== '1' && flag !== 'yes') {
        return { ok: false, reason: 'env', error: 'Set ENABLE_FINGERPRINT_BRIDGE_CONTROL=true in .env and restart the API.' };
    }
    // Use the TCP peer (Vite proxy → Express is loopback). req.ip can be wrong without trust proxy.
    let addr = String(req.socket?.remoteAddress || req.connection?.remoteAddress || '');
    if (addr.startsWith('::ffff:')) addr = addr.slice(7);
    const loopback =
        addr === '127.0.0.1' ||
        addr === '::1' ||
        addr === '0:0:0:0:0:0:0:1';
    if (!loopback) {
        return {
            ok: false,
            reason: 'host',
            error: 'Bridge control only accepts connections from loopback (use http://localhost:5173 for the UI).',
        };
    }
    return { ok: true };
}

/**
 * pkill exits 1 when no process matches; Node's exec() treats that as failure.
 * Spawn avoids the shell and always resolves (unless pkill is missing).
 */
function killBridgePyOnUnix() {
    return new Promise((resolve) => {
        const child = spawn('pkill', ['-f', 'fingerprint_module/bridge.py'], { stdio: 'ignore' });
        child.on('error', (err) => {
            console.warn('fingerprint-bridge/stop: pkill not run:', err.message);
            resolve();
        });
        child.on('close', () => {
            resolve();
        });
    });
}

app.post('/api/fingerprint-bridge/stop', authenticate, authorize(ROLES.ADMIN), async (req, res) => {
    try {
        const auth = bridgeControlAuth(req);
        if (!auth.ok) {
            return res.status(403).json({ ok: false, reason: auth.reason, error: auth.error });
        }
        if (process.platform === 'win32') {
            await execAsync(
                'powershell -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -match \'bridge\\.py\' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"'
            ).catch(() => {});
        } else {
            await killBridgePyOnUnix();
        }
        await recordAudit(req, 'FINGERPRINT_BRIDGE_STOPPED', {
            resourceType: 'fingerprint-bridge'
        });
        return res.json({ ok: true, message: 'Stopped bridge.py processes (if any were running).' });
    } catch (err) {
        console.error('fingerprint-bridge/stop:', err);
        return res.status(500).json({ ok: false, error: err.message });
    }
});

app.post('/api/fingerprint-bridge/start', authenticate, authorize(ROLES.ADMIN), async (req, res) => {
    try {
        const auth = bridgeControlAuth(req);
        if (!auth.ok) {
            return res.status(403).json({ ok: false, reason: auth.reason, error: auth.error });
        }
        const repoRoot = path.resolve(__dirname);
        const fs = await import('fs');
        const pythonDir = process.platform === 'win32' ? 'Scripts' : 'bin';
        const venvPython = path.join(repoRoot, 'fingerprint_module', '.venv', pythonDir, process.platform === 'win32' ? 'python.exe' : 'python');
        const script = path.join(repoRoot, 'fingerprint_module', 'bridge.py');
        if (!fs.existsSync(venvPython)) {
            return res.status(500).json({
                ok: false,
                error: `fingerprint_module/.venv/${pythonDir}/${process.platform === 'win32' ? 'python.exe' : 'python'} not found. Create the venv and install deps.`,
            });
        }
        const env = {
            ...process.env,
            FINGERPRINT_API_BASE: process.env.FINGERPRINT_API_BASE || 'http://127.0.0.1:5001',
        };
        const child = spawn(venvPython, [script], {
            cwd: repoRoot,
            detached: true,
            stdio: 'ignore',
            windowsHide: true,
            env,
        });
        child.unref();
        await recordAudit(req, 'FINGERPRINT_BRIDGE_STARTED', {
            resourceType: 'fingerprint-bridge'
        });
        return res.json({ ok: true, message: 'Started bridge.py in the background.' });
    } catch (err) {
        console.error('fingerprint-bridge/start:', err);
        return res.status(500).json({ ok: false, error: err.message });
    }
});

app.get('/api/audit-logs', authenticate, authorize(ROLES.AUDITOR), asyncHandler(async (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 100, 200);
    const logs = await AuditLog.find()
        .sort({ createdAt: -1 })
        .limit(limit);
    res.json({ data: logs });
}));

// ─── USER MANAGEMENT (Admin only) ─────────────────────────────────────────────

app.get('/api/users', authenticate, authorize(ROLES.ADMIN), asyncHandler(async (req, res) => {
    const users = await User.find().select('-password').sort({ createdAt: -1 });
    res.json(users);
}));

app.post('/api/users', authenticate, authorize(ROLES.ADMIN), requireFields('username', 'password', 'role'), asyncHandler(async (req, res) => {
    const { username, password, role } = req.body;
    const validRoles = Object.values(ROLES);
    if (!validRoles.includes(role)) {
        throw new ApiError(400, `Invalid role. Must be one of: ${validRoles.join(', ')}`, 'VALIDATION_ERROR');
    }
    if (typeof password !== 'string' || password.length < 8) {
        throw new ApiError(400, 'Password must be at least 8 characters', 'VALIDATION_ERROR');
    }
    const existing = await User.findOne({ username: username.trim() });
    if (existing) throw new ApiError(409, 'Username already exists', 'DUPLICATE_USERNAME');

    const hashed = await bcrypt.hash(password, 12);
    const user = await User.create({ username: username.trim(), password: hashed, role });
    await recordAudit(req, 'USER_CREATED', { resourceType: 'user', resourceId: user._id, metadata: { username: user.username, role } });
    res.status(201).json({ _id: user._id, username: user.username, role: user.role, isActive: user.isActive });
}));

app.patch('/api/users/:id', authenticate, authorize(ROLES.ADMIN), asyncHandler(async (req, res) => {
    const { role, isActive, password } = req.body;
    const update = {};
    const validRoles = Object.values(ROLES);
    if (role !== undefined) {
        if (!validRoles.includes(role)) throw new ApiError(400, 'Invalid role', 'VALIDATION_ERROR');
        update.role = role;
    }
    if (isActive !== undefined) update.isActive = Boolean(isActive);
    if (password !== undefined) {
        if (typeof password !== 'string' || password.length < 8) throw new ApiError(400, 'Password must be at least 8 characters', 'VALIDATION_ERROR');
        update.password = await bcrypt.hash(password, 12);
    }
    if (Object.keys(update).length === 0) throw new ApiError(400, 'Nothing to update', 'VALIDATION_ERROR');

    const user = await User.findByIdAndUpdate(req.params.id, update, { new: true }).select('-password');
    if (!user) throw new ApiError(404, 'User not found', 'NOT_FOUND');

    await recordAudit(req, 'USER_UPDATED', { resourceType: 'user', resourceId: user._id, metadata: { changes: Object.keys(update) } });
    res.json(user);
}));

// ─── SYSTEM SETTINGS (GET public to authenticated users, PATCH Admin only) ────

app.get('/api/settings', authenticate, asyncHandler(async (req, res) => {
    const settings = await getSettings();
    res.json(settings);
}));

app.patch('/api/settings', authenticate, authorize(ROLES.ADMIN), asyncHandler(async (req, res) => {
    const allowed = [
        'anomalySensitivity', 'salaryDeviationThreshold', 'maxHoursPerDay',
        'checkDuplicateBank', 'checkDuplicateId', 'sessionTimeoutMinutes',
        'schedule'
    ];
    const update = {};
    for (const key of allowed) {
        if (req.body[key] !== undefined) update[key] = req.body[key];
    }
    if (Object.keys(update).length === 0) throw new ApiError(400, 'No valid settings provided', 'VALIDATION_ERROR');

    const settings = await SystemSettings.findByIdAndUpdate(
        'system',
        { $set: update },
        { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
    );
    await recordAudit(req, 'SETTINGS_UPDATED', { metadata: { keys: Object.keys(update) } });
    res.json(settings);
}));

// Dashboard summary — pre-aggregated stats so the frontend doesn't have to pull every employee record.
app.get('/api/dashboard/summary', authenticate, authorize(ROLES.AUDITOR, ROLES.HR, ROLES.FINANCE), asyncHandler(async (req, res) => {
    const [riskAgg, statusAgg, exposureResult, biometricResult, departmentAgg, recentAnomalies] = await Promise.all([
        // Risk level counts and salary totals
        Employee.aggregate([
            { $group: { _id: '$riskLevel', count: { $sum: 1 }, salarySum: { $sum: { $ifNull: ['$salary', 0] } } } }
        ]),
        // Case status counts and salary totals
        Employee.aggregate([
            { $group: { _id: '$status', count: { $sum: 1 }, salarySum: { $sum: { $ifNull: ['$salary', 0] } } } }
        ]),
        // Total payroll exposure for flagged employees
        Employee.aggregate([
            { $match: { $or: [{ riskLevel: 'High' }, { riskLevel: 'Critical' }, { isGhost: true }] } },
            { $group: { _id: null, totalExposure: { $sum: { $ifNull: ['$salary', 0] } }, count: { $sum: 1 } } }
        ]),
        // Biometric enrollment coverage
        Employee.aggregate([
            { $group: { _id: null, total: { $sum: 1 }, enrolled: { $sum: { $cond: [{ $gt: ['$fingerprintId', null] }, 1, 0] } } } }
        ]),
        // Department risk breakdown (top 10 by high-risk count)
        Employee.aggregate([
            { $group: {
                _id: { $ifNull: ['$department', 'Unassigned'] },
                employeeCount: { $sum: 1 },
                payrollTotal:  { $sum: { $ifNull: ['$salary', 0] } },
                highRiskCount: { $sum: { $cond: [{ $in: ['$riskLevel', ['High', 'Critical']] }, 1, 0] } }
            }},
            { $sort: { highRiskCount: -1 } },
            { $limit: 10 }
        ]),
        // Most suspicious employees (for the recent-anomalies feed)
        Employee.find({ $or: [{ riskLevel: 'High' }, { riskLevel: 'Critical' }, { isGhost: true }] })
            .sort({ anomalyScore: -1 })
            .limit(8)
            .select('employeeId fullName department riskLevel anomalyScore salary status flaggedReasons createdAt')
    ]);

    // Build risk distribution map
    const riskDist = { Low: 0, Medium: 0, High: 0, Critical: 0 };
    let totalSalaryAll = 0;
    riskAgg.forEach(r => {
        if (r._id && Object.hasOwn(riskDist, r._id)) riskDist[r._id] = r.count;
        totalSalaryAll += (r.salarySum || 0);
    });

    const totalEmployees = Object.values(riskDist).reduce((a, b) => a + b, 0);
    const highRiskTotal = riskDist.High + riskDist.Critical;
    const integrityScore = totalEmployees
        ? Math.max(0, Math.round(100 - (highRiskTotal / totalEmployees) * 100))
        : 100;

    // Status distribution
    const statusDist = {};
    statusAgg.forEach(s => {
        if (s._id) statusDist[s._id] = { count: s.count, salarySum: s.salarySum || 0 };
    });

    const confirmedGhost = statusDist['Confirmed Ghost'] || { count: 0, salarySum: 0 };
    const totalExposure = exposureResult[0]?.totalExposure || 0;
    const bio = biometricResult[0] || { total: 0, enrolled: 0 };
    const biometricCoverage = bio.total ? Math.round((bio.enrolled / bio.total) * 100) : 0;
    const avgSalary = totalEmployees ? Math.round(totalSalaryAll / totalEmployees) : 0;

    res.json({
        totalEmployees,
        riskDistribution: riskDist,
        highRiskCount: highRiskTotal,
        totalExposure,
        confirmedGhostsCount: confirmedGhost.count,
        confirmedGhostsSalary: confirmedGhost.salarySum,
        integrityScore,
        biometricCoverage,
        avgSalary,
        departmentStats: departmentAgg.map(d => ({
            department:    d._id,
            employeeCount: d.employeeCount,
            payrollTotal:  d.payrollTotal,
            highRiskCount: d.highRiskCount,
            riskPercent:   d.employeeCount
                ? +((d.highRiskCount / d.employeeCount) * 100).toFixed(1)
                : 0
        })),
        recentAnomalies,
        generatedAt: new Date().toISOString()
    });
}));

// Reserved dashboard API namespace — auth middleware for any future /api/dashboard/* sub-routes.
app.use('/api/dashboard', authenticate, authorize(ROLES.AUDITOR, ROLES.HR, ROLES.FINANCE));

app.use('/api', (req, res, next) => {
    next(new ApiError(404, 'API route not found', 'ROUTE_NOT_FOUND'));
});

app.use((err, req, res, next) => {
    if (res.headersSent) return next(err);

    const statusCode = err.statusCode || 500;
    const response = {
        error: err.message || 'Internal server error',
        code: err.code || 'INTERNAL_SERVER_ERROR'
    };

    if (statusCode >= 500) {
        console.error('API error:', err);
    }

    return res.status(statusCode).json(response);
});

// ─── SCHEDULED ANALYSIS ────────────────────────────────────────────────────────
// Runs a full ML analysis on the current employee database at the configured
// interval. The job checks every 5 minutes whether a run is due.

const ML_SCHEDULER_URL = process.env.VITE_ML_API_URL || 'http://localhost:8000';

async function runScheduledAnalysis() {
    try {
        const settings = await getSettings();
        if (!settings?.schedule?.enabled) return;

        const lastRun = settings.schedule.lastRunAt ? new Date(settings.schedule.lastRunAt) : null;
        const intervalMs = (settings.schedule.intervalHours || 24) * 3_600_000;
        const now = new Date();

        if (lastRun && (now.getTime() - lastRun.getTime()) < intervalMs) return;

        const employees = await Employee.find({ employmentStatus: { $ne: 'Terminated' } });
        if (employees.length === 0) return;

        // Build a minimal CSV from current employee data
        const header = 'employee_id,department,salary,attendance_days,biometric_logs,days_present';
        const rows = employees.map(e =>
            [e.employeeId, e.department || '', e.salary || 0, e.attendanceDays || 0, e.biometricLogs || 0, e.daysPresent || 0].join(',')
        );
        const csvContent = [header, ...rows].join('\n');

        const formData = new FormData();
        formData.append('file', new Blob([csvContent], { type: 'text/csv' }), 'scheduled_employees.csv');

        const mlRes = await fetch(`${ML_SCHEDULER_URL}/predict`, { method: 'POST', body: formData });
        if (!mlRes.ok) throw new Error(`ML service responded ${mlRes.status}`);
        const mlData = await mlRes.json();
        const results = mlData.results || mlData.predictions || [];

        const highCount   = results.filter(r => r.risk === 'High' || r.risk === 'Critical').length;
        const mediumCount = results.filter(r => r.risk === 'Medium').length;

        const batch = await ReportBatch.create({
            reportName: `Scheduled Analysis — ${now.toLocaleDateString()}`,
            date: now,
            summary: { totalAnalyzed: results.length, highRiskCount: highCount, mediumRiskCount: mediumCount },
        });

        if (results.length > 0) {
            await ReportRecord.insertMany(results.map(r => ({ ...r, reportId: batch._id })));
        }

        await SystemSettings.findByIdAndUpdate('system', { 'schedule.lastRunAt': now });
        console.log(`[scheduler] Completed: ${results.length} employees processed — ${highCount} high-risk`);
    } catch (err) {
        console.error('[scheduler] Analysis failed:', err.message);
    }
}

const PORT = process.env.PORT || 5000;

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
        // Check every 5 minutes whether a scheduled run is due.
        const schedulerInterval = setInterval(runScheduledAnalysis, 5 * 60 * 1000);
        schedulerInterval.unref();
    });
}

export default app;
