import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { authApi } from './api';
import { useAuth } from './AuthContext';
import { Lock, Mail, User, ArrowLeft, ShieldCheck } from 'lucide-react';
import { motion } from 'motion/react';
import BackgroundPattern from './components/BackgroundPattern';

export default function Register() {
  const [email, setEmail] = useState('');
  const [nickname, setNickname] = useState('');
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
            const data = await authApi.register(email, password, nickname);
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
      
      <header className="mb-8 relative z-10">
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
          <div className="inline-flex items-center justify-center w-16 h-16 border border-app-secondary rounded-full mb-8">
            <ShieldCheck className="w-6 h-6 text-white" />
          </div>

          <h1 className="text-3xl font-medium text-white mb-4">Create Account</h1>
          <p className="text-app-text-muted mb-10 leading-relaxed">
            Join CipherChat to experience secure, end-to-end encrypted messaging.
          </p>

          <form onSubmit={handleSubmit} className="space-y-5 w-full text-left">
            <div className="space-y-2">
              <label className="text-sm font-medium text-app-text-muted ml-1">Nickname</label>
              <input
                type="text"
                required
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                className="input-field"
                placeholder="Choose a nickname"
              />
            </div>

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
                placeholder="Create a password"
              />
            </div>

            {error && <p className="text-red-400 text-sm text-center">{error}</p>}

            <div className="pt-6 space-y-4">
              <button
                type="submit"
                disabled={isLoading}
                className="btn-primary w-full"
              >
                {isLoading ? 'Creating Account...' : 'Register'}
              </button>
              
              <Link
                to="/login"
                className="btn-secondary w-full inline-block text-center"
              >
                Already have an account?
              </Link>
            </div>
          </form>
        </motion.div>
      </main>
    </div>
  );
}
