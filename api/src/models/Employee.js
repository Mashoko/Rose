import mongoose from 'mongoose';

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
    status: { type: String, enum: ['Pending', 'Under Investigation', 'False Positive', 'Confirmed Ghost'], default: 'Pending' }
}, { timestamps: true });

const Employee = mongoose.model('Employee', EmployeeSchema);

export default Employee;
