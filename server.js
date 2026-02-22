import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

dotenv.config();

const app = express();
// Increase payload size limit to handle potentially large CSV result arrays
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Connection string from prompt
const MONGO_URI = "mongodb+srv://tanakamashoko02_db_user:SlWaJhxX7ofDlDN8@geds.vfjgwpc.mongodb.net/?appName=GEDS";

mongoose.connect(MONGO_URI)
    .then(() => console.log('MongoDB Connected'))
    .catch(err => console.error('MongoDB Connection Error:', err));

// Employee Schema (Tentative - based on requirements)
const EmployeeSchema = new mongoose.Schema({
    employeeId: String,
    fullName: String,
    department: String,
    role: String,
    salary: Number,
    attendanceDays: Number, // out of ~22
    biometricLogs: Number,
    lastActive: Date,
    riskLevel: { type: String, enum: ['Low', 'Medium', 'High', 'Critical'] },
    isGhost: Boolean,
    anomalyScore: Number, // 0-100
    flaggedReasons: [String],
}, { timestamps: true });

const Employee = mongoose.model('Employee', EmployeeSchema);

// User Schema
const UserSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true }
});

const User = mongoose.model('User', UserSchema);

// Analysis Report Schema
const ReportSchema = new mongoose.Schema({
    reportName: { type: String, default: "Analysis Report" },
    date: { type: Date, default: Date.now },
    summary: {
        totalAnalyzed: Number,
        highRiskCount: Number,
        mediumRiskCount: Number,
        lowRiskCount: Number
    },
    // We can store a snapshot of the high/medium risk records natively, or all of them.
    // Storing all might become huge, but is requested for full history.
    details: [mongoose.Schema.Types.Mixed]
}, { timestamps: true });

const Report = mongoose.model('Report', ReportSchema);


// Routes
app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

app.get('/api/employees', async (req, res) => {
    try {
        const employees = await Employee.find().sort({ riskLevel: -1 }); // High risk first
        res.json(employees);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Reports Routes
app.post('/api/reports', async (req, res) => {
    try {
        const { summary, details, reportName } = req.body;
        const newReport = new Report({
            reportName: reportName || `Analysis Run - ${new Date().toLocaleString()}`,
            summary,
            details
        });
        const savedReport = await newReport.save();
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


// Seed/Reset Endpoint for Demo
app.post('/api/seed', async (req, res) => {
    try {
        await Employee.deleteMany({});
        const dummyData = [
            { employeeId: "HIT001", fullName: "John Doe", department: "Finance", salary: 5000, attendanceDays: 22, biometricLogs: 22, riskLevel: "Low", isGhost: false, anomalyScore: 5 },
            { employeeId: "HIT002", fullName: "Jane Smith", department: "IT", salary: 4500, attendanceDays: 0, biometricLogs: 0, riskLevel: "Critical", isGhost: true, anomalyScore: 98, flaggedReasons: ["0% Attendance", "No Academic Workload"] },
            { employeeId: "HIT003", fullName: "Robert Brown", department: "Admin", salary: 3000, attendanceDays: 15, biometricLogs: 10, riskLevel: "Medium", isGhost: false, anomalyScore: 45, flaggedReasons: ["Mismatch biometric vs manual"] },
        ];
        await Employee.insertMany(dummyData);
        res.json({ message: "Database seeded with dummy data" });
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

import { fileURLToPath } from 'url';

const PORT = process.env.PORT || 5000;

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
}

export default app;
