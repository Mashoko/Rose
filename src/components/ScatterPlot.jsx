import React from 'react';
import {
    Chart as ChartJS,
    LinearScale,
    PointElement,
    LineElement,
    Tooltip,
    Legend,
} from 'chart.js';
import { Scatter } from 'react-chartjs-2';

ChartJS.register(LinearScale, PointElement, LineElement, Tooltip, Legend);

export const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
        legend: {
            position: 'top',
        },
        title: {
            display: false,
        },
        tooltip: {
            callbacks: {
                label: (context) => {
                    return `ID: ${context.raw.id || 'N/A'} - Sal: $${context.raw.y}, Days: ${context.raw.x}`;
                }
            }
        }
    },
    scales: {
        y: {
            title: {
                display: true,
                text: 'Salary Amount ($)'
            },
            beginAtZero: true
        },
        x: {
            title: {
                display: true,
                text: 'Attendance Days'
            },
            min: 0,
            max: 30 // Approx max days in month
        },
    },
};

const ScatterPlot = ({ data }) => {
    // Setup data format if not provided correctly, but assuming data is passed in Chart.js format
    // Or handle transformation here.

    // Example expected data prop structure:
    // {
    //   datasets: [
    //     {
    //       label: 'Normal Employees',
    //       data: [{x: 20, y: 5000}, ...],
    //       backgroundColor: 'rgba(0, 0, 128, 0.5)',
    //     },
    //     {
    //       label: 'Anomalies (Ghosts)',
    //       data: [{x: 0, y: 5000}, ...],
    //       backgroundColor: 'rgba(255, 0, 0, 1)',
    //     },
    //   ],
    // }

    return (
        <div className="w-full h-96">
            <Scatter options={options} data={data} />
        </div>
    );
};

export default ScatterPlot;
