import mongoose from 'mongoose';

const UserSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    role: {
        type: String,
        enum: ['Admin', 'Auditor', 'HR Officer', 'Finance Officer'],
        required: true,
        default: 'Auditor'
    },
    isActive: { type: Boolean, default: true },
    lastLoginAt: Date
});

const User = mongoose.model('User', UserSchema);

export default User;
