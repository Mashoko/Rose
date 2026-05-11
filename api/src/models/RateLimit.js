import mongoose from 'mongoose';

// MongoDB-backed rate-limit store. TTL index auto-deletes expired windows.
const RateLimitSchema = new mongoose.Schema({
    key:      { type: String, required: true, unique: true },
    count:    { type: Number, default: 0 },
    resetAt:  { type: Date,   required: true },
    expireAt: { type: Date,   required: true },
});

RateLimitSchema.index({ expireAt: 1 }, { expireAfterSeconds: 0 });

const RateLimit = mongoose.model('RateLimit', RateLimitSchema);
export default RateLimit;
