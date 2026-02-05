import React from 'react';
import clsx from 'clsx';
import { ArrowUpRight, ArrowDownRight } from 'lucide-react';

const StatusCard = ({ title, value, subtext, type = 'neutral', icon: Icon }) => {
    return (
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 flex items-start justify-between hover:shadow-md transition-shadow">
            <div>
                <p className="text-sm font-medium text-gray-500 mb-1">{title}</p>
                <h3 className={clsx("text-3xl font-bold mb-2", {
                    "text-gray-900": type === 'neutral',
                    "text-secondary": type === 'danger',
                    "text-primary": type === 'primary'
                })}>
                    {value}
                </h3>
                {subtext && (
                    <p className="text-xs text-gray-400 flex items-center gap-1">
                        {subtext}
                    </p>
                )}
            </div>

            {Icon && (
                <div className={clsx("p-3 rounded-lg", {
                    "bg-blue-50 text-primary": type === 'primary' || type === 'neutral',
                    "bg-red-50 text-secondary": type === 'danger',
                })}>
                    <Icon className="w-6 h-6" />
                </div>
            )}
        </div>
    );
};

export default StatusCard;
