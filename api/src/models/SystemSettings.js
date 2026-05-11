import mongoose from 'mongoose';

// Singleton document — always upserted with _id='system'.
const SystemSettingsSchema = new mongoose.Schema({
    _id: { type: String, default: 'system' },

    // ML model parameters
    anomalySensitivity:       { type: Number, default: 50, min: 5, max: 95 },
    salaryDeviationThreshold: { type: Number, default: 20, min: 1, max: 200 },
    maxHoursPerDay:           { type: Number, default: 16, min: 8, max: 24 },
    checkDuplicateBank:       { type: Boolean, default: true },
    checkDuplicateId:         { type: Boolean, default: true },

    // Session / RBAC (informational — JWT expiry is set via JWT_EXPIRES_IN env)
    sessionTimeoutMinutes: { type: Number, default: 60 },

    // Scheduled analysis
    schedule: {
        enabled:       { type: Boolean, default: false },
        intervalHours: { type: Number, default: 24, min: 1, max: 168 },
        lastRunAt:     { type: Date,    default: null },
    },
}, {
    _id: false,         // we supply the _id ourselves
    timestamps: true,
});

const SystemSettings = mongoose.model('SystemSettings', SystemSettingsSchema);

// Returns the singleton, creating it with defaults if absent.
export async function getSettings() {
    let doc = await SystemSettings.findById('system');
    if (!doc) {
        doc = await SystemSettings.create({ _id: 'system' });
    }
    return doc;
}

export default SystemSettings;
