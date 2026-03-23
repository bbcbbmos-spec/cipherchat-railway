import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { authApi } from './api';
import { useAuth } from './AuthContext';
import { Lock, Mail, ArrowLeft } from 'lucide-react';
import { motion } from 'motion/react';
import BackgroundPattern from './components/BackgroundPattern';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    try {
      const data = await authApi.login({ email, password });
      await login(data, password);
      navigate('/');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-app-bg p-6 relative overflow-hidden">
      <BackgroundPattern primaryColor="180, 130, 70" opacity={0.4} />
      
      <header className="mb-12 relative z-10">
        <button onClick={() => navigate(-1)} title="Go back" className="text-white hover:opacity-70 transition-opacity">
          <ArrowLeft className="w-6 h-6" />
        </button>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center max-w-md mx-auto w-full text-center relative z-10">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full"
        >
          <div className="mb-16">
            <div className="text-7xl font-light tracking-tight mb-4">
              <span className="text-white font-sans">Ci</span>
              <span className="text-app-primary italic font-serif -ml-1">pher</span>
            </div>
            <div className="text-[10px] uppercase tracking-[0.3em] text-app-text-muted font-semibold">
              End-to-End Encrypted Messenger
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6 w-full text-left">
            <div className="space-y-2">
              <label className="text-sm font-medium text-app-text-muted ml-1">Email Address</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input-field"
                placeholder="Enter your email"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-app-text-muted ml-1">Password</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input-field"
                placeholder="Enter your password"
              />
            </div>

            {error && <p className="text-red-400 text-sm text-center">{error}</p>}

            <div className="pt-6 space-y-4">
              <button
                type="submit"
                disabled={isLoading}
                className="btn-primary w-full"
              >
                {isLoading ? 'Logging in...' : 'Log In'}
              </button>
              
              <Link
                to="/register"
                className="btn-secondary w-full inline-block text-center"
              >
                Create Account
              </Link>
            </div>
          </form>
        </motion.div>
      </main>
    </div>
  );
}
