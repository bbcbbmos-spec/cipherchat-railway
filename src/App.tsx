import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './AuthContext';
import Login from './Login';
import Register from './Register';
import ChatList from './ChatList';
import ChatWindow from './ChatWindow';
import React, { useState, useEffect } from 'react';
import { MessageSquare, Shield, Lock, Loader2 } from 'lucide-react';
import BackgroundPattern from './components/BackgroundPattern';
import { ErrorBoundary } from './ErrorBoundary';

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
    <div className="min-h-screen flex flex-col items-center justify-center p-6 pt-safe pb-safe">
      <BackgroundPattern primaryColor={[180, 130, 70]} opacity={0.15} />
      <div className="relative z-10 w-full max-w-md space-y-6">
        <div className="flex justify-center mb-6">
          {isUnlocking ? <Loader2 size={40} className="animate-spin text-app-primary" /> : <Lock size={40} className="text-app-primary" />}
        </div>
        <div className="text-center">
          <h2 className="text-2xl font-medium text-white mb-2">App Locked</h2>
          <p className="text-app-text-muted text-sm">Your session is encrypted. Enter your password to resume.</p>
        </div>
        <form onSubmit={handleUnlock} className="space-y-4">
          <input
            type="password"
            placeholder="Enter password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="input-field text-center text-lg"
            autoFocus
            disabled={isUnlocking}
          />
          {error && <p className="text-red-400 text-sm text-center">{error}</p>}
          <button
            type="submit"
            disabled={isUnlocking}
            className="btn-primary w-full"
          >
            {isUnlocking ? <>Decrypting...</> : 'Unlock Vault'}
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
      <div className="flex flex-col items-center gap-4">
        <Loader2 size={32} className="animate-spin text-app-primary" />
        <span className="text-app-text-muted text-sm">Initializing CipherChat</span>
      </div>
    </div>
  );
  if (!user) return <Navigate to="/login" replace />;
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
    <div className="h-screen flex overflow-hidden bg-app-bg">
      <BackgroundPattern
        primaryColor={theme === 'elegant' ? [180, 130, 70] : [234, 179, 8]}
        opacity={0.3}
      />
      
      {/* Sidebar - скрыт на мобиле когда чат открыт */}
      <div className={`w-full md:w-[380px] md:flex-shrink-0 md:border-r md:border-app-secondary/30 ${
        selectedChat ? 'hidden md:block' : 'block'
      }`}>
        <ChatList
          onSelectChat={(chat) => setSelectedChat(chat)}
          selectedChatId={selectedChat?.id}
          theme={theme}
          toggleTheme={toggleTheme}
          refreshTrigger={refreshKey}
        />
      </div>

      {/* Main content - на мобиле показывается только если чат выбран */}
      <div className={`flex-1 ${
        selectedChat ? 'block' : 'hidden md:flex'
      }`}>
        <ErrorBoundary
          fallback={
            <div className="flex flex-col items-center justify-center h-full gap-4 p-6 text-center">
              <p className="text-red-400">Something went wrong</p>
              <p className="text-app-text-muted text-sm">Could not load this chat. Please try going back and selecting the chat again.</p>
              <button
                onClick={() => setSelectedChat(null)}
                className="px-4 py-2 bg-app-primary text-black rounded-lg hover:opacity-90"
              >
                Go back
              </button>
            </div>
          }
        >
          {selectedChat ? (
            <ChatWindow
              chat={selectedChat}
              onBack={() => setSelectedChat(null)}
              onDelete={handleDelete}
              theme={theme}
              toggleTheme={toggleTheme}
            />
          ) : (
            <div className="hidden md:flex flex-col items-center justify-center h-full text-app-text-muted">
              <MessageSquare size={48} className="mb-4 opacity-30" />
              <h3 className="text-lg font-medium">Select a conversation</h3>
              <p className="text-sm">Choose a chat from the sidebar to start messaging.</p>
            </div>
          )}
        </ErrorBoundary>
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
    <Router>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/" element={
            <ProtectedRoute>
              <Dashboard theme={theme} toggleTheme={toggleTheme} />
            </ProtectedRoute>
          } />
        </Routes>
      </AuthProvider>
    </Router>
  );
}
