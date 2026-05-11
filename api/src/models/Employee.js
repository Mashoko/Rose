import mongoose from 'mongoose';

const EmployeeSchema = new mongoose.Schema({
    employeeId: String,
    fingerprintId: { type: Number, unique: true, sparse: true }, // AS608 template ID
    fullName: String,
    email: { type: String, unique: true, sparse: true },
    department: String,
    role: String,
    salary: Number,
    attendanceDays: Number, // out of ~22
    biometricLogs: Number,
    /** YYYY-MM-DD (server local) — last day attendance was counted (one present per calendar day) */
    lastAttendanceDate: String,
    lastActive: Date,
    riskLevel: { type: String, enum: ['Low', 'Medium', 'High', 'Critical'] },
    isGhost: Boolean,
    anomalyScore: Number, // 0-100
    flaggedReasons: [String],
    // store raw feature vector used by the model for transparency
    features: { type: mongoose.Schema.Types.Mixed },
    modelInfo: {
        name: String,
        contamination: Number,
        prediction: String
    },
    // system determination statement with classification, confidence, and reasoning
    determination: {
        classification: String,
        confidence: Number,
        reasoning: [String]
    },
    status: { type: String, enum: ['Pending', 'Under Investigation', 'False Positive', 'Confirmed Ghost'], default: 'Pending' },

    // HR / payroll fields — populated when data is loaded from CSV or HR system
    dateEmployed:      Date,
    bankAccount:       String,
    nationalId:        { type: String, sparse: true },
    contractType:      { type: String, enum: ['Full-Time', 'Part-Time', 'Contract', 'Temporary'] },
    payrollFrequency:  { type: String, enum: ['Monthly', 'Bi-Weekly', 'Weekly'], default: 'Monthly' },
    employmentStatus:  { type: String, enum: ['Active', 'Inactive', 'Terminated', 'On Leave'], default: 'Active' }
}, { timestamps: true });

const Employee = mongoose.model('Employee', EmployeeSchema);

export default Employee;
