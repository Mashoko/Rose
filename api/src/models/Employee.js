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
    status: { type: String, enum: ['Pending', 'Under Investigation', 'False Positive', 'Confirmed Ghost'], default: 'Pending' }
}, { timestamps: true });

const Employee = mongoose.model('Employee', EmployeeSchema);

export default Employee;
