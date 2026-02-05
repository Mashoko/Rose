import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

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

const PORT = 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
