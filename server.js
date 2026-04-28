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
// Increase payload size limit to handle potentially large CSV result arrays
app.use(cors());
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
import ReportBatch from './api/src/models/ReportBatch.js';
import ReportRecord from './api/src/models/ReportRecord.js';

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

// Helper to broadcast to all SSE clients
const broadcastNewReportEvent = () => {
    clients.forEach(client => {
        client.res.write(`data: ${JSON.stringify({ event: 'new_report', timestamp: Date.now() })}\n\n`);
    });
};


// Routes
app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

// Dataset information (local CSVs)
app.get('/api/dataset-info', async (req, res) => {
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
            } catch (err) {
                return { name: f, error: 'not found' };
            }
        });
        res.json(info);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get all employees
app.get('/api/employees', async (req, res) => {
    try {
        const employees = await Employee.find().sort({ riskLevel: -1 }); // High risk first
        res.json(employees);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Update employee case status
app.patch('/api/employees/:id/status', async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        const validStatuses = ['Pending', 'Under Investigation', 'False Positive', 'Confirmed Ghost'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({ error: 'Invalid status value' });
        }

        const employee = await Employee.findOneAndUpdate(
            { employeeId: id },
            { status: status },
            { new: true }
        );

        if (!employee) {
            // Fallback: try by MongoDB _id just in case
            const empById = await Employee.findByIdAndUpdate(id, { status }, { new: true });
            if (!empById) return res.status(404).json({ error: 'Employee not found' });
            return res.json(empById);
        }

        res.json(employee);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==== Reports Routes ====
app.post('/api/reports', async (req, res) => {
    try {
        const { summary, details, reportName } = req.body;
        const newReport = new Report({
            reportName: reportName || `Analysis Run - ${new Date().toLocaleString()}`,
            summary,
            details
        });
        const savedReport = await newReport.save();

        // Notify any active dashboard clients about the new report
        broadcastNewReportEvent();

        res.status(201).json(savedReport);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/reports', async (req, res) => {
    try {
        // Exclude the 'details' array in the list view to save massive bandwidth.
        // It can be fetched by ID later if needed, but for the table, we just need summary data.
        const reports = await Report.find({}, '-details').sort({ date: -1 });
        res.json(reports);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/reports/:id', async (req, res) => {
    try {
        const report = await Report.findById(req.params.id);
        if (!report) return res.status(404).json({ error: 'Report not found' });
        res.json(report);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// === Historical Data Route ===
// Accepts optional ?employeeId= to filter records per employee
// Returns only real records from the database; no demo placeholders.
app.get('/api/history', async (req, res) => {
    try {
        const { employeeId } = req.query;
        const filter = {};
        if (employeeId) filter.employeeId = employeeId;
        const records = await History.find(filter).sort({ _id: 1 });
        return res.json({ data: records });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// CSV download endpoint
app.get('/api/history/csv', async (req, res) => {
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
        res.send(csv);
    } catch (err) {
        console.error('CSV endpoint error:', err);
        res.status(500).json({ error: 'Failed to generate CSV', message: err.message });
    }
});

// Real-Time SSE Endpoint
app.get('/api/stream/reports', (req, res) => {
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
app.patch('/api/employees/enroll-fingerprint', async (req, res) => {
    try {
        const { employeeId, fingerprintId } = req.body;
        if (fingerprintId === undefined || fingerprintId === null) {
            return res.status(400).json({ error: 'fingerprintId is required' });
        }

        const employee = await Employee.findOneAndUpdate(
            { employeeId },
            { fingerprintId },
            { new: true }
        );

        if (!employee) return res.status(404).json({ error: 'Employee not found' });
        res.json({ message: 'Fingerprint enrolled successfully', employee });
    } catch (err) {
        // Duplicate key error (fingerprintId already assigned to another employee)
        if (err.code === 11000) {
            return res.status(409).json({ error: 'This fingerprint ID is already enrolled to another employee' });
        }
        res.status(500).json({ error: err.message });
    }
});

// ATTENDANCE: Mark present when a finger is scanned by the Pico W / Python bridge
app.post('/api/attendance/scan', async (req, res) => {
    try {
        const { fingerprintId } = req.body;
        if (fingerprintId === undefined || fingerprintId === null) {
            return res.status(400).json({ error: 'fingerprintId is required' });
        }

        const employee = await Employee.findOne({ fingerprintId });
        if (!employee) return res.status(404).json({ error: 'Fingerprint not recognized' });

        // One counted present per local calendar day (YYYY-MM-DD)
        const today = new Date().toLocaleDateString('en-CA');
        const alreadyToday = employee.lastAttendanceDate === today;

        employee.biometricLogs = (employee.biometricLogs || 0) + 1;
        employee.lastActive = new Date();

        if (alreadyToday) {
            await employee.save();
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

        res.json({
            message: `Attendance marked for ${employee.fullName}`,
            employee,
            alreadyPresentToday: false
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Auth Routes
app.post('/api/auth/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const user = await User.findOne({ username });
        if (!user) return res.status(400).json({ error: 'Invalid credentials' });

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(400).json({ error: 'Invalid credentials' });

        const token = jwt.sign({ id: user._id, username: user.username }, 'secretkey_rose_123', { expiresIn: '1h' });
        res.json({ token, user: { username: user.username } });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/auth/seed', async (req, res) => {
    try {
        const existingUser = await User.findOne({ username: 'Rose' });
        if (existingUser) return res.json({ message: 'User Rose already exists' });

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash('190603', salt);

        const newUser = new User({ username: 'Rose', password: hashedPassword });
        await newUser.save();

        res.json({ message: 'User Rose created successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
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

app.post('/api/fingerprint-bridge/stop', async (req, res) => {
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
        return res.json({ ok: true, message: 'Stopped bridge.py processes (if any were running).' });
    } catch (err) {
        console.error('fingerprint-bridge/stop:', err);
        return res.status(500).json({ ok: false, error: err.message });
    }
});

app.post('/api/fingerprint-bridge/start', async (req, res) => {
    try {
        const auth = bridgeControlAuth(req);
        if (!auth.ok) {
            return res.status(403).json({ ok: false, reason: auth.reason, error: auth.error });
        }
        const repoRoot = path.resolve(__dirname);
        const venvPython = path.join(repoRoot, 'fingerprint_module', '.venv', 'bin', 'python');
        const script = path.join(repoRoot, 'fingerprint_module', 'bridge.py');
        const fs = await import('fs');
        if (!fs.existsSync(venvPython)) {
            return res.status(500).json({
                ok: false,
                error: 'fingerprint_module/.venv/bin/python not found. Create the venv and install deps.',
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
            env,
        });
        child.unref();
        return res.json({ ok: true, message: 'Started bridge.py in the background.' });
    } catch (err) {
        console.error('fingerprint-bridge/start:', err);
        return res.status(500).json({ ok: false, error: err.message });
    }
});

const PORT = process.env.PORT || 5000;

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
}

export default app;
