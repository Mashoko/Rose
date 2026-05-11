import React, { useState, useEffect, useCallback } from 'react';
import {
    Users, Plus, Edit2, UserCheck, UserX, X, Loader2, AlertTriangle, CheckCircle, Eye, EyeOff,
} from 'lucide-react';
import clsx from 'clsx';
import { getAuthHeaders } from '../services/api';

const ROLES = ['Admin', 'Auditor', 'HR Officer', 'Finance Officer'];

const ROLE_COLORS = {
    'Admin':           'bg-purple-100 text-purple-800 border-purple-200',
    'Auditor':         'bg-blue-100 text-blue-800 border-blue-200',
    'HR Officer':      'bg-emerald-100 text-emerald-800 border-emerald-200',
    'Finance Officer': 'bg-amber-100 text-amber-800 border-amber-200',
};

// ─── Create / Edit modal ───────────────────────────────────────────────────────
const UserModal = ({ user, onClose, onSaved }) => {
    const isEdit = Boolean(user);
    const [username, setUsername]   = useState(user?.username  || '');
    const [role,     setRole]       = useState(user?.role      || 'Auditor');
    const [password, setPassword]   = useState('');
    const [showPwd,  setShowPwd]    = useState(false);
    const [saving,   setSaving]     = useState(false);
    const [error,    setError]      = useState('');

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        if (!isEdit && password.length < 8) {
            setError('Password must be at least 8 characters.');
            return;
        }
        setSaving(true);
        try {
            const body = isEdit
                ? { role, ...(password ? { password } : {}) }
                : { username: username.trim(), role, password };

            const res = await fetch(isEdit ? `/api/users/${user._id}` : '/api/users', {
                method: isEdit ? 'PATCH' : 'POST',
                headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
                body: JSON.stringify(body),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to save user.');
            onSaved(data, isEdit);
        } catch (err) {
            setError(err.message);
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm px-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
                <div className="flex items-center justify-between mb-5">
                    <h3 className="text-lg font-bold text-gray-900">
                        {isEdit ? `Edit — ${user.username}` : 'Create New User'}
                    </h3>
                    <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-full text-gray-500">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {error && (
                    <div className="mb-4 flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                        <AlertTriangle className="w-4 h-4 shrink-0" /> {error}
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">
                    {!isEdit && (
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Username</label>
                            <input
                                type="text"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                required
                                autoFocus
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                placeholder="e.g. jsmith"
                            />
                        </div>
                    )}

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
                        <select
                            value={role}
                            onChange={(e) => setRole(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                            {ROLES.map(r => <option key={r}>{r}</option>)}
                        </select>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            {isEdit ? 'New Password (leave blank to keep current)' : 'Password'}
                        </label>
                        <div className="relative">
                            <input
                                type={showPwd ? 'text' : 'password'}
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required={!isEdit}
                                className="w-full px-3 py-2 pr-10 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                placeholder={isEdit ? '••••••••' : 'Min. 8 characters'}
                            />
                            <button
                                type="button"
                                onClick={() => setShowPwd(v => !v)}
                                className="absolute inset-y-0 right-0 px-3 text-gray-400 hover:text-gray-600"
                            >
                                {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                        </div>
                    </div>

                    <div className="flex gap-3 pt-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={saving}
                            className="flex-1 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
                        >
                            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                            {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Create User'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

// ─── Main page ─────────────────────────────────────────────────────────────────
const UserManagement = () => {
    const [users,   setUsers]   = useState([]);
    const [loading, setLoading] = useState(true);
    const [error,   setError]   = useState(null);
    const [modal,   setModal]   = useState(null); // null | 'create' | user-object
    const [toast,   setToast]   = useState(null); // { ok, message }

    const showToast = (ok, message) => {
        setToast({ ok, message });
        setTimeout(() => setToast(null), 4000);
    };

    const loadUsers = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch('/api/users', { headers: getAuthHeaders() });
            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                throw new Error(body.error || `HTTP ${res.status}`);
            }
            setUsers(await res.json());
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { loadUsers(); }, [loadUsers]);

    const handleToggleActive = async (user) => {
        try {
            const res = await fetch(`/api/users/${user._id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
                body: JSON.stringify({ isActive: !user.isActive }),
            });
            if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed');
            setUsers(prev => prev.map(u => u._id === user._id ? { ...u, isActive: !u.isActive } : u));
            showToast(true, `${user.username} ${!user.isActive ? 'activated' : 'deactivated'}.`);
        } catch (err) {
            showToast(false, err.message);
        }
    };

    const handleSaved = (saved, isEdit) => {
        if (isEdit) {
            setUsers(prev => prev.map(u => u._id === saved._id ? saved : u));
            showToast(true, `${saved.username} updated.`);
        } else {
            setUsers(prev => [saved, ...prev]);
            showToast(true, `User "${saved.username}" created.`);
        }
        setModal(null);
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                        <Users className="w-6 h-6 text-blue-600" /> User Management
                    </h1>
                    <p className="text-gray-500 mt-1 text-sm">Manage system accounts, roles, and access.</p>
                </div>
                <button
                    onClick={() => setModal('create')}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors shadow-sm"
                >
                    <Plus className="w-4 h-4" /> New User
                </button>
            </div>

            {/* Toast */}
            {toast && (
                <div className={clsx(
                    'flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium border',
                    toast.ok
                        ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                        : 'bg-red-50 text-red-800 border-red-200'
                )}>
                    {toast.ok
                        ? <CheckCircle className="w-4 h-4 shrink-0" />
                        : <AlertTriangle className="w-4 h-4 shrink-0" />}
                    {toast.message}
                </div>
            )}

            {/* Table */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                {loading ? (
                    <div className="flex items-center justify-center gap-3 py-20 text-gray-500">
                        <Loader2 className="w-6 h-6 animate-spin" />
                        <span>Loading users…</span>
                    </div>
                ) : error ? (
                    <div className="flex flex-col items-center gap-3 py-20">
                        <AlertTriangle className="w-8 h-8 text-red-400" />
                        <p className="text-red-700 text-sm font-medium">{error}</p>
                        <button onClick={loadUsers} className="text-blue-600 text-sm hover:underline">Retry</button>
                    </div>
                ) : users.length === 0 ? (
                    <div className="flex flex-col items-center gap-3 py-20 text-gray-400">
                        <Users className="w-10 h-10" />
                        <p className="text-sm">No users found. Create the first one.</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse text-sm">
                            <thead>
                                <tr className="bg-gray-50 border-b border-gray-200 text-xs uppercase tracking-wider text-gray-500">
                                    <th className="px-5 py-3 font-semibold">Username</th>
                                    <th className="px-5 py-3 font-semibold">Role</th>
                                    <th className="px-5 py-3 font-semibold">Status</th>
                                    <th className="px-5 py-3 font-semibold">Last Login</th>
                                    <th className="px-5 py-3 font-semibold text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {users.map(u => (
                                    <tr key={u._id} className="hover:bg-gray-50 transition-colors">
                                        <td className="px-5 py-4">
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-xs select-none">
                                                    {u.username.charAt(0).toUpperCase()}
                                                </div>
                                                <span className="font-medium text-gray-900">{u.username}</span>
                                            </div>
                                        </td>
                                        <td className="px-5 py-4">
                                            <span className={clsx('px-2.5 py-0.5 rounded-full text-xs font-medium border', ROLE_COLORS[u.role] || 'bg-gray-100 text-gray-700 border-gray-200')}>
                                                {u.role}
                                            </span>
                                        </td>
                                        <td className="px-5 py-4">
                                            {u.isActive
                                                ? <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" /> Active</span>
                                                : <span className="inline-flex items-center gap-1 text-xs font-medium text-gray-400"><span className="w-1.5 h-1.5 rounded-full bg-gray-400 inline-block" /> Inactive</span>}
                                        </td>
                                        <td className="px-5 py-4 text-gray-500">
                                            {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }) : 'Never'}
                                        </td>
                                        <td className="px-5 py-4 text-right">
                                            <div className="flex items-center justify-end gap-2">
                                                <button
                                                    onClick={() => setModal(u)}
                                                    title="Edit"
                                                    className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                                >
                                                    <Edit2 className="w-4 h-4" />
                                                </button>
                                                <button
                                                    onClick={() => handleToggleActive(u)}
                                                    title={u.isActive ? 'Deactivate' : 'Activate'}
                                                    className={clsx('p-1.5 rounded-lg transition-colors', u.isActive
                                                        ? 'text-gray-500 hover:text-red-600 hover:bg-red-50'
                                                        : 'text-gray-500 hover:text-emerald-600 hover:bg-emerald-50')}
                                                >
                                                    {u.isActive ? <UserX className="w-4 h-4" /> : <UserCheck className="w-4 h-4" />}
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Modal */}
            {modal && (
                <UserModal
                    user={modal === 'create' ? null : modal}
                    onClose={() => setModal(null)}
                    onSaved={handleSaved}
                />
            )}
        </div>
    );
};

export default UserManagement;
