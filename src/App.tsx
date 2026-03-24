import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './AuthContext';
import Login from './Login';
import Register from './Register';
import ChatList from './ChatList';
import ChatWindow from './ChatWindow';
import React, { useState, useEffect } from 'react';
import { MessageSquare, Shield, Lock, Loader2 } from 'lucide-react';
import BackgroundPattern from './components/BackgroundPattern'; import { ErrorBoundary } from './ErrorBoundary';

// Safe localStorage wrapper — Safari Private Mode throws on access
const safeLS = {
  get: (key: string): string | null => {
    try { return localStorage.getItem(key); } catch { return null; }
  },
  set: (key: string, value: string): void => {
    try { localStorage.setItem(key, value); } catch {}
  },
};

function UnlockScreen() {
  const { unlock } = useAuth();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isUnlocking, setIsUnlocking] = useState(false);

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isUnlocking) return;
    setIsUnlocking(true);
    setError(null);
    try {
      await new Promise(r => setTimeout(r, 50));
      await unlock(password);
    } catch (err) {
      console.error('[Unlock] Failed:', err);
      setError('Invalid password');
    } finally {
      setIsUnlocking(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <BackgroundPattern />
      <div className="card max-w-md w-full p-8 text-center relative z-10">
        <div className="flex justify-center mb-6">
          {isUnlocking ? (
            <Loader2 className="w-16 h-16 text-primary animate-spin" />
          ) : (
            <Lock className="w-16 h-16 text-primary" />
          )}
        </div>
        <h1 className="text-2xl font-bold mb-2">App Locked</h1>
        <p className="text-secondary mb-8">Your session is encrypted. Enter your password to resume.</p>
        <form onSubmit={handleUnlock} className="space-y-4">
          <input
            type="password"
            placeholder="Enter password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="input-field text-center text-lg disabled:opacity-50"
            autoFocus
            disabled={isUnlocking}
          />
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <button type="submit" className="btn-primary w-full disabled:opacity-50" disabled={isUnlocking}>
            {isUnlocking ? (
              <><Loader2 className="w-4 h-4 animate-spin inline mr-2" />Decrypting...</>
            ) : (
              'Unlock Vault'
            )}
          </button>
        </form>
      </div>
    </div>
  );
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading, isLocked } = useAuth();
  if (isLoading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <Loader2 className="w-12 h-12 animate-spin text-primary mx-auto mb-4" />
        <p className="text-secondary">Initializing CipherChat</p>
      </div>
    </div>
  );
  if (!user) return <Navigate to="/login" />;
  if (isLocked) return <UnlockScreen />;
  return <>{children}</>;
}

function Dashboard({ theme, toggleTheme }: { theme: 'elegant' | 'vibrant', toggleTheme: () => void }) {
  const [selectedChat, setSelectedChat] = useState<any>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const handleDelete = () => {
    setSelectedChat(null);
    setRefreshKey(prev => prev + 1);
  };
  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar - Chat List */}
      <div className={`${selectedChat ? 'hidden md:flex' : 'flex'} w-full md:w-80 flex-shrink-0`}>
        <ChatList onSelectChat={setSelectedChat} selectedChatId={selectedChat?.id} key={refreshKey} />
      </div>
      {/* Main Content - Chat Window */}
      <div className={`${selectedChat ? 'flex' : 'hidden md:flex'} flex-1 flex-col h-full`}>
        {selectedChat ? (
          <ErrorBoundary><ChatWindow
            chat={selectedChat}
            onBack={() => setSelectedChat(null)}
            onDelete={handleDelete}
            theme={theme}
            toggleTheme={toggleTheme}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <MessageSquare className="w-16 h-16 text-muted mx-auto mb-4" />
              <h3 className="text-xl font-semibold mb-2">Select a conversation</h3>
              <p className="text-secondary">Choose a chat from the sidebar to start messaging.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function App() {
  const [theme, setTheme] = useState<'elegant'|'vibrant'>(() => {
    return (safeLS.get('app-theme') as 'elegant'|'vibrant') || 'elegant';
  });
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    safeLS.set('app-theme', theme);
  }, [theme]);
  const toggleTheme = () => setTheme(t => t === 'elegant' ? 'vibrant' : 'elegant');
  return (
    <AuthProvider>
      <Router>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/" element={
            <ProtectedRoute>
              <Dashboard theme={theme} toggleTheme={toggleTheme} />
            </ProtectedRoute>
          } />
        </Routes>
      </Router>
    </AuthProvider>
  );
}
