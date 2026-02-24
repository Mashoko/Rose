import React, { useRef } from 'react';
import {
    Chart as ChartJS,
    LinearScale,
    PointElement,
    LineElement,
    Tooltip,
    Legend,
} from 'chart.js';
import { Scatter, getElementAtEvent } from 'react-chartjs-2';

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

const ScatterPlot = ({ data, onPointClick }) => {
    const chartRef = useRef();

    const onClick = (event) => {
        if (!chartRef.current || !onPointClick) return;

        const element = getElementAtEvent(chartRef.current, event);
        if (element.length > 0) {
            const datasetIndex = element[0].datasetIndex;
            const dataIndex = element[0].index;
            const pointData = data.datasets[datasetIndex].data[dataIndex];
            onPointClick(pointData);
        }
    };

    return (
        <div className="w-full h-96 cursor-pointer">
            <Scatter ref={chartRef} options={options} data={data} onClick={onClick} />
        </div>
    );
};

export default ScatterPlot;
