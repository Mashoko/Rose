import React, { useState } from 'react';
import { FileText, AlertTriangle, X, CheckCircle, Clock } from 'lucide-react';
import clsx from 'clsx';
import { motion } from 'framer-motion';
import { updateEmployeeStatus } from '../services/api';

const DetailModal = ({ employee, onClose, onUpdate }) => {
    const [updating, setUpdating] = useState(false);

    if (!employee) return null;

    const handleStatusUpdate = async (newStatus) => {
        setUpdating(true);
        try {
            await updateEmployeeStatus(employee.id || employee.employeeId, newStatus);
            if (onUpdate) onUpdate(employee.id || employee.employeeId, newStatus);
        } catch (err) {
            console.error(err);
            alert("Failed to update case status.")
        } finally {
            setUpdating(false);
        }
    };

    const currentStatus = employee.status || 'Pending';

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-end bg-black/50 backdrop-blur-sm">
            <motion.div
                initial={{ x: "100%" }}
                animate={{ x: 0 }}
                exit={{ x: "100%" }}
                className="w-full max-w-md h-full bg-white shadow-2xl p-0 overflow-y-auto flex flex-col"
            >
                <div className="p-6 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white z-10 shrink-0">
                    <h3 className="text-xl font-bold text-gray-800">Audit Card</h3>
                    <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full text-gray-500">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="p-6 space-y-6 flex-1">
                    <div>
                        <div className="flex items-center gap-4 mb-4">
                            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center text-2xl font-bold text-gray-600 shrink-0">
                                {employee.name?.charAt(0) || '?'}
                            </div>
                            <div>
                                <h4 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                                    {employee.name}
                                    <span className={clsx("text-xs px-2 py-0.5 rounded-full font-medium border flex items-center gap-1", {
                                        "bg-yellow-50 text-yellow-700 border-yellow-200": currentStatus === 'Pending',
                                        "bg-orange-50 text-orange-700 border-orange-200": currentStatus === 'Under Investigation',
                                        "bg-gray-100 text-gray-700 border-gray-200": currentStatus === 'False Positive',
                                        "bg-red-50 text-red-700 border-red-200": currentStatus === 'Confirmed Ghost',
                                    })}>
                                        {currentStatus === 'Pending' && <Clock className="w-3 h-3" />}
                                        {currentStatus === 'Under Investigation' && <AlertTriangle className="w-3 h-3" />}
                                        {currentStatus === 'False Positive' && <CheckCircle className="w-3 h-3" />}
                                        {currentStatus === 'Confirmed Ghost' && <AlertTriangle className="w-3 h-3" />}
                                        {currentStatus}
                                    </span>
                                </h4>
                                <p className="text-sm text-gray-500">{employee.id || employee.employeeId} • {employee.department}</p>
                            </div>
                        </div>

                        <div className={clsx("p-4 rounded-xl border mb-6", {
                            "bg-red-50 border-red-100 text-red-900": employee.risk === 'High',
                            "bg-yellow-50 border-yellow-100 text-yellow-900": employee.risk === 'Medium',
                            "bg-green-50 border-green-100 text-green-900": employee.risk === 'Low',
                        })}>
                            <div className="flex items-center justify-between mb-2">
                                <span className="font-bold text-sm uppercase tracking-wide">Anomaly Score</span>
                                <span className="text-2xl font-bold">{employee.score || 0}%</span>
                            </div>
                            <div className="w-full bg-white/50 h-2 rounded-full overflow-hidden">
                                <div className="h-full bg-current" style={{ width: `${employee.score || 0}%` }}></div>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <h5 className="font-bold text-gray-800 flex items-center gap-2">
                                <FileText className="w-4 h-4" />
                                System Explanation
                            </h5>
                            <p className="text-gray-600 text-sm leading-relaxed bg-gray-50 p-4 rounded-lg border border-gray-100">
                                {employee.explanation || "No explanation available."}
                            </p>
                        </div>
                    </div>
                </div>

                <div className="p-6 border-t border-gray-100 bg-white sticky bottom-0 z-10 space-y-3 shrink-0">
                    <h5 className="font-bold text-sm text-gray-500 uppercase tracking-wider mb-2">Case Management Actions</h5>

                    {currentStatus !== 'Under Investigation' && currentStatus !== 'Confirmed Ghost' && (
                        <button
                            onClick={() => handleStatusUpdate('Under Investigation')}
                            disabled={updating}
                            className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg shadow-sm transition-colors flex items-center justify-center gap-2 disabled:opacity-50">
                            <Clock className="w-4 h-4" />
                            {updating ? 'Updating...' : 'Start Investigation'}
                        </button>
                    )}

                    {currentStatus !== 'Confirmed Ghost' && (
                        <button
                            onClick={() => handleStatusUpdate('Confirmed Ghost')}
                            disabled={updating}
                            className="w-full py-3 bg-red-600 hover:bg-red-700 text-white font-medium rounded-lg shadow-sm transition-colors flex items-center justify-center gap-2 disabled:opacity-50">
                            <AlertTriangle className="w-4 h-4" />
                            {updating ? 'Updating...' : 'Mark as Confirmed Ghost'}
                        </button>
                    )}

                    {currentStatus !== 'False Positive' && (
                        <button
                            onClick={() => handleStatusUpdate('False Positive')}
                            disabled={updating}
                            className="w-full py-3 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 font-medium rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                            <CheckCircle className="w-4 h-4" />
                            {updating ? 'Updating...' : 'Mark as False Positive (Safe)'}
                        </button>
                    )}

                    {currentStatus === 'Pending' && (
                        <p className="text-xs text-center text-gray-400 mt-2">Update status to clear from pending queue</p>
                    )}
                </div>
            </motion.div>
        </div>
    );
};

export default DetailModal;
