import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './AuthContext';
import Login from './Login';
import Register from './Register';
import ChatList from './ChatList';
import ChatWindow from './ChatWindow';
import React, { useState, useEffect } from 'react';
import { MessageSquare, Shield, Lock, Loader2 } from 'lucide-react';
import BackgroundPattern from './components/BackgroundPattern';

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
    <div className="min-h-screen bg-app-bg flex items-center justify-center p-6 relative overflow-hidden">
      <BackgroundPattern primaryColor="180, 130, 70" />
      <div className="w-full max-w-md bg-app-surface/80 backdrop-blur-xl p-8 rounded-[2.5rem] border border-app-secondary/20 shadow-2xl relative z-10">
        <div className="flex flex-col items-center mb-8">
          <div className="w-20 h-20 bg-app-primary/10 rounded-3xl flex items-center justify-center mb-6 border border-app-primary/20">
            {isUnlocking ? (
              <Loader2 className="w-10 h-10 text-app-primary animate-spin" />
            ) : (
              <Lock className="w-10 h-10 text-app-primary" />
            )}
          </div>
          <h2 className="text-2xl font-medium text-white">App Locked</h2>
          <p className="text-app-text-muted text-sm mt-3 text-center">Your session is encrypted. Enter your password to resume.</p>
        </div>
        
        <form onSubmit={handleUnlock} className="space-y-6">
          <input
            type="password"
            placeholder="Enter password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="input-field text-center text-lg disabled:opacity-50"
            autoFocus
            disabled={isUnlocking}
          />
          {error && <p className="text-red-400 text-xs text-center animate-pulse">{error}</p>}
          <button 
            type="submit" 
            disabled={isUnlocking || !password}
            className="btn-primary w-full py-4 text-lg flex items-center justify-center gap-2"
          >
            {isUnlocking ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Decrypting...
              </>
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
    <div className="min-h-screen bg-app-bg flex items-center justify-center text-white relative overflow-hidden">
      <BackgroundPattern primaryColor="180, 130, 70" />
      <div className="flex flex-col items-center gap-4 relative z-10">
        <div className="w-12 h-12 border-4 border-app-primary/30 border-t-app-primary rounded-full animate-spin" />
        <p className="text-app-text-muted font-medium tracking-widest uppercase text-[10px]">Initializing CipherChat</p>
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
    <div className="flex h-screen overflow-hidden relative">
      <div className="fixed inset-0 z-0">
        <BackgroundPattern 
          primaryColor={theme === 'elegant' ? '180, 130, 70' : '234, 179, 8'} 
          opacity={theme === 'elegant' ? 0.4 : 0.3}
        />
      </div>
      
      <div className="flex w-full h-full relative z-10 bg-transparent">
        {/* Sidebar - Chat List */}
        <div className={`${selectedChat ? 'hidden md:block' : 'block'} w-full md:w-80 lg:w-96 shrink-0 h-full`}>
          <ChatList 
            refreshTrigger={refreshKey}
            onSelectChat={setSelectedChat} 
            selectedChatId={selectedChat?.id} 
            theme={theme}
            toggleTheme={toggleTheme}
          />
        </div>

        {/* Main Content - Chat Window */}
        <div className={`${selectedChat ? 'block' : 'hidden md:flex'} flex-1 h-full relative overflow-hidden`}>
          {selectedChat ? (
            <ChatWindow 
              chat={selectedChat} 
              onBack={() => setSelectedChat(null)} 
              onDelete={handleDelete}
              theme={theme}
              toggleTheme={toggleTheme}
            />
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-app-text-muted p-8 text-center bg-transparent">
              <div className="relative mb-8">
                <div className="w-24 h-24 bg-app-surface/40 backdrop-blur-md rounded-[2rem] flex items-center justify-center border border-app-secondary/20 shadow-2xl rotate-3">
                  <MessageSquare className="w-10 h-10 text-app-primary -rotate-3" />
                </div>
                <div className="absolute -bottom-2 -right-2 w-10 h-10 bg-app-primary rounded-2xl flex items-center justify-center shadow-lg border-4 border-app-bg">
                  <Shield className="w-5 h-5 text-white" />
                </div>
              </div>
              <h2 className="text-2xl font-medium text-white mb-3">Select a conversation</h2>
              <p className="max-w-xs text-sm leading-relaxed text-app-text-muted">
                Choose a chat from the sidebar to start messaging. All your conversations are protected with AES-256-GCM encryption.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [theme, setTheme] = useState<'elegant'|'vibrant'>(() => {
    return (localStorage.getItem('app-theme') as 'elegant'|'vibrant') || 'elegant';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('app-theme', theme);
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
