import mongoose from 'mongoose';

const ReportRecordSchema = new mongoose.Schema({
    batchId: { type: mongoose.Schema.Types.ObjectId, ref: 'ReportBatch', required: true },
    employeeId: { type: String, required: true },
    fullName: { type: String, required: true },
    department: { type: String, required: true },
    salary: { type: Number, required: true },
    attendanceDays: { type: Number },
    riskLevel: { type: String, enum: ['Low', 'Medium', 'High', 'Critical'] },
    anomalyScore: { type: Number },
    explanation: { type: String },
    humanFeedback: { type: String, enum: ['Pending', 'Verified Ghost', 'Marked Safe'], default: 'Pending' }
}, { timestamps: true });

const ReportRecord = mongoose.model('ReportRecord', ReportRecordSchema);

export default ReportRecord;
