import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { BarChart2, Lock, User } from 'lucide-react';

const Login = () => {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const { login } = useAuth();

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        const res = await login(username, password);
        if (!res.success) {
            setError(res.message);
        }
    };

    return (
        <div className="relative flex items-center justify-center min-h-screen overflow-hidden bg-[#0f172a]">
            {/* Background "Data" Elements */}
            <div className="absolute inset-0 z-0">
                {/* Gradient background */}
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,#1e293b,#0f172a)]"></div>

                {/* Floating blurs for "high-tech" feel */}
                <div className="absolute top-[-10%] right-[-5%] w-96 h-96 bg-purple-500/20 rounded-full blur-3xl animate-pulse"></div>
                <div className="absolute bottom-[-10%] left-[-10%] w-[500px] h-[500px] bg-blue-500/10 rounded-full blur-3xl"></div>

                {/* Technical Grid Pattern */}
                <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)]"></div>
            </div>

            {/* Glass Card */}
            <div className="relative z-10 w-full max-w-md p-8 rounded-2xl border border-white/10 shadow-[0_8px_32px_0_rgba(0,0,0,0.37)] backdrop-blur-xl bg-slate-900/60">
                <div className="flex flex-col items-center mb-8">
                    <div className="p-4 mb-4 rounded-2xl bg-gradient-to-br from-cyan-500/20 to-blue-600/20 border border-cyan-500/30 shadow-lg shadow-cyan-500/20 backdrop-blur-sm">
                        <BarChart2 className="w-8 h-8 text-cyan-400" />
                    </div>
                    <h2 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-white to-slate-400 tracking-tight">Analytics Portal</h2>
                    <p className="text-slate-400 mt-2 text-sm font-light">Enter your credentials to access the dashboard</p>
                </div>

                {error && (
                    <div className="p-3 mb-6 text-sm text-red-200 bg-red-500/10 border border-red-500/20 rounded-lg backdrop-blur-sm flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-red-400"></div>
                        {error}
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="space-y-2">
                        <label className="text-xs focus:text-cyan-400 font-semibold text-slate-400 uppercase tracking-wider ml-1">Username</label>
                        <div className="relative group">
                            <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-slate-500 group-focus-within:text-cyan-400 transition-colors">
                                <User className="w-5 h-5" />
                            </div>
                            <input
                                type="text"
                                className="w-full pl-10 pr-4 py-3 bg-slate-950/50 border border-slate-700/50 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50 text-white placeholder-slate-600 transition-all duration-200 hover:bg-slate-950/70 hover:border-slate-600"
                                placeholder="Enter your username"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                required
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="text-xs focus:text-cyan-400 font-semibold text-slate-400 uppercase tracking-wider ml-1">Password</label>
                        <div className="relative group">
                            <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-slate-500 group-focus-within:text-cyan-400 transition-colors">
                                <Lock className="w-5 h-5" />
                            </div>
                            <input
                                type="password"
                                className="w-full pl-10 pr-4 py-3 bg-slate-950/50 border border-slate-700/50 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50 text-white placeholder-slate-600 transition-all duration-200 hover:bg-slate-950/70 hover:border-slate-600"
                                placeholder="••••••••"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                            />
                        </div>
                    </div>

                    <button
                        type="submit"
                        className="w-full py-3.5 px-4 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-medium rounded-lg shadow-lg shadow-cyan-900/20 transform transition-all duration-200 hover:translate-y-[-1px] focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:ring-offset-2 focus:ring-offset-slate-900 mt-2"
                    >
                        Access Dashboard
                    </button>

                </form>
            </div>

            {/* Footer Text */}
            <div className="absolute bottom-6 text-xs text-slate-600 font-mono">
                SECURE CONNECTION // ENCRYPTED
            </div>
        </div>
    );
};

export default Login;
