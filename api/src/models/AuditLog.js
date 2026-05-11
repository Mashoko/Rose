import mongoose from 'mongoose';

const AuditLogSchema = new mongoose.Schema({
    action: { type: String, required: true, index: true },
    actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    actorUsername: String,
    actorRole: String,
    status: {
        type: String,
        enum: ['success', 'failure'],
        default: 'success',
        index: true
    },
    resourceType: String,
    resourceId: String,
    ip: String,
    userAgent: String,
    metadata: { type: mongoose.Schema.Types.Mixed }
}, { timestamps: true });

const AuditLog = mongoose.model('AuditLog', AuditLogSchema);

export default AuditLog;
