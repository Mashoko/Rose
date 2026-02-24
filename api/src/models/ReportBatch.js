import mongoose from 'mongoose';

const ReportBatchSchema = new mongoose.Schema({
    date: { type: Date, default: Date.now },
    totalAnalyzed: { type: Number, required: true },
    totalExposure: { type: Number, required: true },
    highRiskCount: { type: Number, required: true },
    mediumRiskCount: { type: Number, required: true },
    lowRiskCount: { type: Number, required: true },
    overallRiskScore: { type: Number, required: true }
}, { timestamps: true });

const ReportBatch = mongoose.model('ReportBatch', ReportBatchSchema);

export default ReportBatch;
