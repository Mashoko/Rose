import React from 'react';
import StatusCard from '../components/StatusCard';
import ScatterPlot from '../components/ScatterPlot';
import { Users, AlertTriangle, DollarSign, Activity } from 'lucide-react';

const Dashboard = () => {
    // Mock Data for Visualization
    const scatterData = {
        datasets: [
            {
                label: 'Normal Employees',
                data: Array.from({ length: 50 }, () => ({
                    x: 20 + Math.floor(Math.random() * 5), // 20-25 days
                    y: 3000 + Math.floor(Math.random() * 5000), // 3000-8000 salary
                })),
                backgroundColor: 'rgba(0, 0, 128, 0.6)', // Navy
            },
            {
                label: 'Suspected Ghosts',
                data: [
                    { x: 0, y: 5000, id: 'HIT002' },
                    { x: 2, y: 4500, id: 'HIT045' },
                    { x: 0, y: 3200, id: 'HIT089' },
                ],
                backgroundColor: 'rgba(255, 0, 0, 1)', // Red
                pointRadius: 6,
            },
        ],
    };

    return (
        <div className="space-y-8">
            {/* Header Section */}
            <div>
                <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
                <p className="text-gray-500">Welcome back, get an at-a-glance view of payroll health.</p>
            </div>

            {/* Status Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <StatusCard
                    title="Total Records Processed"
                    value="1,248"
                    subtext="+12 new this month"
                    icon={Users}
                    type="neutral"
                />
                <StatusCard
                    title="Suspicious Records"
                    value="3"
                    subtext="Needs immediate review"
                    icon={AlertTriangle}
                    type="danger"
                />
                <StatusCard
                    title="Est. Financial Loss"
                    value="$12,700"
                    subtext="Potential monthly savings"
                    icon={DollarSign}
                    type="danger" // Or primary, but loss is bad/important
                />
            </div>

            {/* Visualizations */}
            <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
                <div className="flex items-center justify-between mb-6">
                    <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                        <Activity className="w-5 h-5 text-primary" />
                        Payroll Anomaly Detection
                    </h3>
                    <div className="flex bg-gray-100 p-1 rounded-lg text-xs">
                        <button className="px-3 py-1 bg-white shadow-sm rounded-md font-medium text-gray-800">Scatter</button>
                        <button className="px-3 py-1 text-gray-500 hover:text-gray-800">List</button>
                    </div>
                </div>

                <ScatterPlot data={scatterData} />

                <div className="mt-4 p-4 bg-blue-50 rounded-lg text-sm text-blue-800 flex items-start gap-2">
                    <span className="font-bold">Insight:</span>
                    <p>3 employees are receiving full salary with near-zero attendance. These are flagged as high-probability Ghost Employees (Red dots).</p>
                </div>
            </div>
        </div>
    );
};

export default Dashboard;
