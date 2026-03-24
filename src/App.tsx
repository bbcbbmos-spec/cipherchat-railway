import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './AuthContext';
import Login from './Login';
import Register from './Register';
import ChatList from './ChatList';
import ChatWindow from './ChatWindow';
import React, { useState, useEffect } from 'react';
import { MessageSquare, Shield, Lock, Loader2 } from 'lucide-react';
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
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', height: '100%', padding: '20px',
      paddingTop: 'max(20px, env(safe-area-inset-top))',
      paddingBottom: 'max(20px, env(safe-area-inset-bottom))'
    }}>
      <div style={{ marginBottom: 24 }}>
        {isUnlocking ? <Loader2 size={40} className="animate-spin" /> : <Lock size={40} />}
      </div>
      <h2 style={{ color: '#fff', marginBottom: 8 }}>App Locked</h2>
      <p style={{ color: '#888', textAlign: 'center', marginBottom: 24 }}>
        Your session is encrypted. Enter your password to resume.
      </p>
      <form onSubmit={handleUnlock} style={{ width: '100%', maxWidth: 320 }}>
        <input
          type="password"
          placeholder="Enter password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={{ width: '100%', padding: '12px 16px', borderRadius: 12,
            border: '1px solid #333', background: '#1a1a1a', color: '#fff',
            fontSize: 16, marginBottom: 12 }}
          autoFocus
          disabled={isUnlocking}
        />
        {error && <p style={{ color: '#f44', textAlign: 'center', marginBottom: 8 }}>{error}</p>}
        <button type="submit" disabled={isUnlocking}
          style={{ width: '100%', padding: '12px', borderRadius: 12,
            background: '#c9a84c', border: 'none', color: '#000',
            fontSize: 16, fontWeight: 600, cursor: 'pointer' }}>
          {isUnlocking ? 'Decrypting...' : 'Unlock Vault'}
        </button>
      </form>
    </div>
  );
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading, isLocked } = useAuth();
  if (isLoading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center',
      height: '100%', flexDirection: 'column', gap: 16 }}>
      <Loader2 size={32} className="animate-spin" style={{ color: '#c9a84c' }} />
      <span style={{ color: '#888', fontSize: 14 }}>Initializing CipherChat</span>
    </div>
  );
  if (!user) return <Navigate to="/login" replace />;
  if (isLocked) return <UnlockScreen />;
  return <>{children}</>;
}

// ====================================================================
// Dashboard — Телеграм-подобный layout:
// Мобил: список чатов | окно чата — видно по очереди, полный экран
// Десктоп: две колонки рядом
// ====================================================================
function Dashboard({ theme, toggleTheme }: { theme: 'elegant' | 'vibrant', toggleTheme: () => void }) {
  const [selectedChat, setSelectedChat] = useState<any>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleSelectChat = (chat: any) => {
    setSelectedChat(chat);
  };

  const handleBack = () => {
    setSelectedChat(null);
  };

  const handleDelete = () => {
    setSelectedChat(null);
    setRefreshKey(prev => prev + 1);
  };

  if (isMobile) {
    // Мобильный layout: один экран за раз
    return (
      <div style={{
        position: 'fixed', inset: 0,
        paddingTop: 'env(safe-area-inset-top)',
        paddingBottom: 'env(safe-area-inset-bottom)',
        paddingLeft: 'env(safe-area-inset-left)',
        paddingRight: 'env(safe-area-inset-right)',
        background: '#09090b',
        overflow: 'hidden'
      }}>
        {/* Слайдер: если чат выбран — ChatWindow, если нет — ChatList */}
        <div style={{
          position: 'absolute', inset: 0,
          transform: selectedChat ? 'translateX(-100%)' : 'translateX(0)',
          transition: 'transform 0.3s cubic-bezier(0.4,0,0.2,1)',
          willChange: 'transform'
        }}>
          <ChatList
            onSelectChat={handleSelectChat}
            selectedChatId={selectedChat?.id}
            theme={theme}
            toggleTheme={toggleTheme}
            refreshTrigger={refreshKey}
          />
        </div>
        <div style={{
          position: 'absolute', inset: 0,
          transform: selectedChat ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 0.3s cubic-bezier(0.4,0,0.2,1)',
          willChange: 'transform'
        }}>
          {selectedChat ? (
            <ErrorBoundary fallback={
              <div style={{ padding: 24, color: '#f44', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
                <p>Something went wrong. Please go back and try again.</p>
                <button onClick={handleBack} style={{ padding: '8px 20px', background: '#c9a84c', border: 'none', borderRadius: 8, cursor: 'pointer', color: '#000' }}>
                  ← Go back
                </button>
              </div>
            }>
              <ChatWindow
                chat={selectedChat}
                onBack={handleBack}
                onDelete={handleDelete}
                theme={theme}
                toggleTheme={toggleTheme}
              />
            </ErrorBoundary>
          ) : null}
        </div>
      </div>
    );
  }

  // Десктопный layout: две колонки
  return (
    <div style={{
      display: 'flex', height: '100dvh', overflow: 'hidden',
      background: '#09090b'
    }}>
      {/* Sidebar */}
      <div style={{ width: 380, flexShrink: 0, borderRight: '1px solid rgba(255,255,255,0.06)', overflow: 'hidden' }}>
        <ChatList
          onSelectChat={handleSelectChat}
          selectedChatId={selectedChat?.id}
          theme={theme}
          toggleTheme={toggleTheme}
          refreshTrigger={refreshKey}
        />
      </div>
      {/* Main content */}
      <div style={{ flex: 1, overflow: 'hidden' }}>
        <ErrorBoundary fallback={
          <div style={{ padding: 24, color: '#f44', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, height: '100%', justifyContent: 'center' }}>
            <p>Something went wrong loading this chat.</p>
            <button onClick={handleBack} style={{ padding: '8px 20px', background: '#c9a84c', border: 'none', borderRadius: 8, cursor: 'pointer', color: '#000' }}>
              Go back
            </button>
          </div>
        }>
          {selectedChat ? (
            <ChatWindow
              chat={selectedChat}
              onBack={handleBack}
              onDelete={handleDelete}
              theme={theme}
              toggleTheme={toggleTheme}
            />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#555' }}>
              <MessageSquare size={48} style={{ marginBottom: 16, opacity: 0.3 }} />
              <h3 style={{ margin: 0, fontWeight: 500 }}>Select a conversation</h3>
              <p style={{ margin: '8px 0 0', fontSize: 14 }}>Choose a chat from the sidebar to start messaging.</p>
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
