import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './AuthContext';
import Login from './Login';
import Register from './Register';
import ChatList from './ChatList';
import ChatWindow from './ChatWindow';
import React, { useState, useEffect, Component, ReactNode } from 'react';
import { MessageSquare, Shield, Lock, Loader2 } from 'lucide-react';
import BackgroundPattern from './components/BackgroundPattern';

class ErrorBoundary extends Component<{children:ReactNode},{hasError:boolean,error:Error|null}> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{padding:'20px',color:'#ff6b6b',background:'#111',minHeight:'100vh',fontFamily:'monospace'}}>
          <h2 style={{marginBottom:'12px'}}>Something crashed</h2>
          <pre style={{whiteSpace:'pre-wrap',fontSize:'12px',opacity:0.8}}>
            {this.state.error?.message}
            {'\n'}
            {this.state.error?.stack}
          </pre>
          <button
            onClick={() => window.location.reload()}
            style={{marginTop:'16px',padding:'8px 16px',background:'#333',color:'white',border:'none',borderRadius:'8px',cursor:'pointer'}}
          >Reload</button>
        </div>
      );
    }
    return this.props.children;
  }
}

// Safe localStorage wrapper - Safari Private Mode throws on access
const safeLS = {
  get: (key: string): string | null => {
    try { return localStorage.getItem(key); } catch { return null; }
  },
  set: (key: string, value: string): void => {
    try { localStorage.setItem(key, value); } catch {}
  },
};

const LOCK_TIMEOUT = 5 * 60 * 1000; // 5 minutes

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
      // Give UI a chance to show loading state before heavy crypto
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
    <div className="min-h-screen bg-app-bg flex items-center justify-center p-4 relative overflow-hidden">
      <BackgroundPattern />
      <div className="relative z-10 bg-app-surface/90 backdrop-blur-xl border border-app-secondary/30 rounded-3xl p-8 w-full max-w-md shadow-2xl">
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-app-primary/20 flex items-center justify-center mb-4">
            <Lock className="w-8 h-8 text-app-primary" />
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">App Locked</h2>
          <p className="text-app-text-muted text-sm text-center">Your session is encrypted. Enter your password to resume.</p>
        </div>
        <form onSubmit={handleUnlock} className="space-y-4">
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="Enter password"
            className="w-full bg-app-bg border border-app-secondary/30 rounded-xl px-4 py-3 text-white outline-none focus:border-app-primary transition-colors"
            autoFocus
          />
          {error && <p className="text-red-400 text-sm text-center">{error}</p>}
          <button
            type="submit"
            disabled={isUnlocking}
            className="w-full bg-app-primary text-white py-3 rounded-xl font-semibold hover:bg-app-primary-hover transition-colors disabled:opacity-50"
          >
            {isUnlocking ? 'Unlocking...' : 'Unlock Vault'}
          </button>
        </form>
        <p className="text-center text-app-text-muted text-xs mt-6 uppercase tracking-widest">End-to-End Encrypted</p>
      </div>
    </div>
  );
}

function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, isLocked, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-app-bg flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 text-app-primary animate-spin" />
          <p className="text-app-text-muted text-sm">Initializing CipherChat</p>
        </div>
      </div>
    );
  }

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
    <div className="flex h-screen h-[100dvh] bg-app-bg overflow-hidden">
      {/* Sidebar - Chat List */}
      <div className={`${
        selectedChat ? 'hidden md:flex' : 'flex'
      } w-full md:w-80 lg:w-96 flex-shrink-0`}>
        <ChatList
          onSelectChat={setSelectedChat}
          selectedChatId={selectedChat?.id}
          theme={theme}
          toggleTheme={toggleTheme}
          refreshTrigger={refreshKey}
        />
      </div>

      {/* Main Content - Chat Window */}
      <div className={`${
        selectedChat ? 'flex' : 'hidden md:flex'
      } flex-1 overflow-hidden`}>
        {selectedChat ? (
          <ChatWindow
            chat={selectedChat}
            onBack={() => setSelectedChat(null)}
            onDelete={handleDelete}
            theme={theme}
            toggleTheme={toggleTheme}
          />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
            <MessageSquare className="w-16 h-16 text-app-primary/30 mb-4" />
            <h3 className="text-xl font-semibold text-white mb-2">Select a conversation</h3>
            <p className="text-app-text-muted text-sm max-w-sm">
              Choose a chat from the sidebar to start messaging.
            </p>
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
    <ErrorBoundary>
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
    </ErrorBoundary>
  );
}
