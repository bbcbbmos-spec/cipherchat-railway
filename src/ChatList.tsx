import React, { useState, useEffect } from 'react';
import { chatApi, userApi } from './api';
import { useAuth } from './AuthContext';
import { MessageSquare, Plus, Search, Users, LogOut, Bell, Filter, SlidersHorizontal, Bookmark, Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import BackgroundPattern from './components/BackgroundPattern';
import { getSocket } from './socket';

interface ChatListProps {
  onSelectChat: (chat: any) => void;
  selectedChatId?: number;
  theme: 'elegant' | 'vibrant';
  toggleTheme: () => void;
  refreshTrigger?: number;
}

export default function ChatList({ onSelectChat, selectedChatId, theme, toggleTheme, refreshTrigger }: ChatListProps) {
  const [chats, setChats] = useState<any[]>([]);
  const [savedMessages, setSavedMessages] = useState<any[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [isCreatingChat, setIsCreatingChat] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [view, setView] = useState<'chats' | 'saved'>('chats');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<any[]>([]);
  const [groupName, setGroupName] = useState('');
  const [unreadCount, setUnreadCount] = useState(0);
  const { user, logout } = useAuth();

  useEffect(() => {
    fetchChats();
    const timer = setTimeout(() => fetchSavedMessages(), 500);
    return () => clearTimeout(timer);
  }, [refreshTrigger]);

  useEffect(() => {
    const socket = getSocket();
    const handleNewMessage = (message: any) => {
      if (message.sender_id !== user?.id) {
        setChats(prev => prev.map(c => 
          c.id === message.chat_id 
            ? { 
                ...c, 
                unread_count: (c.unread_count || 0) + 1,
                last_message: message.encrypted_text || message.ciphertext,
                last_message_time: message.timestamp 
              } 
            : c
        ));
      }
    };

    socket.on('new_message', handleNewMessage);
    return () => {
      socket.off('new_message', handleNewMessage);
    };
  }, [user?.id]);

  useEffect(() => {
    if (selectedChatId) {
      setChats(prev => prev.map(c => 
        c.id === selectedChatId ? { ...c, unread_count: 0 } : c
      ));
      // Notify server
      chatApi.markRead(selectedChatId).catch(console.error);
    }
  }, [selectedChatId]);

  useEffect(() => {
    const totalUnread = chats.filter((c: any) => (c.unread_count || 0) > 0).length;
    setUnreadCount(totalUnread);
  }, [chats]);

  const fetchChats = async () => {
    try {
      const data = await chatApi.list();
      // The server now returns unread_count, so we don't need Promise.all with N+1 queries
      setChats(data);
    } catch (err) {
      console.error('Failed to fetch chats', err);
    }
  };

  const fetchSavedMessages = async () => {
    try {
      const data = await chatApi.getSavedMessages();
      setSavedMessages(data);
    } catch (err) {
      console.error('Failed to fetch saved messages', err);
    }
  };

  const [isSearching, setIsSearching] = useState(false);
  const handleSearch = async (query: string) => {
    setSearchQuery(query);
    const trimmedQuery = query.trim();
    if (trimmedQuery.length < 1) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }
    setIsSearching(true);
    try {
      const data = await userApi.search(trimmedQuery);
      setSearchResults(data);
    } catch (err: any) {
      console.error('Search failed:', err);
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  const createChat = async () => {
    if (selectedUsers.length === 0) return;
    setIsCreatingChat(true);
    setCreateError(null);
    try {
      if (!user?.id) {
        setCreateError('User data is incomplete. Please log in again.');
        return;
      }
      const type = selectedUsers.length > 1 ? 'group' : 'private';

      if (type === 'private') {
        const existingChat = chats.find(c => 
          c.type === 'private' && c.participant_ids?.includes(selectedUsers[0].id)
        );
        if (existingChat) {
          setIsCreating(false);
          setSelectedUsers([]);
          onSelectChat(existingChat);
          return;
        }
      }

      const newChat = await chatApi.create({
        type,
        participantIds: selectedUsers.map(u => u.id),
        name: type === 'group' ? groupName : null,
        encryptedKeys: {}
      });

      setIsCreating(false);
      setSelectedUsers([]);
      setGroupName('');
      fetchChats();
      onSelectChat(newChat);
    } catch (err: any) {
      console.error('Failed to create chat', err);
      setCreateError(err.message || 'Failed to create chat.');
    } finally {
      setIsCreatingChat(false);
    }
  };

  const toggleSaveMessage = async (e: React.MouseEvent, messageId: number) => {
    e.stopPropagation();
    try {
      await chatApi.toggleSaveMessage(messageId);
      fetchSavedMessages();
    } catch (err) {
      console.error('Failed to toggle save message', err);
    }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden bg-app-bg relative">
      <BackgroundPattern opacity={0.03} />
      
      {/* Header */}
      <div className="p-6 flex flex-col gap-6 z-10 relative">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold bg-gradient-to-br from-white to-white/60 bg-clip-text text-transparent">
              Messages
            </h1>
            {unreadCount > 0 && (
              <span className="px-2 py-0.5 rounded-full bg-app-primary text-[10px] font-bold text-white uppercase tracking-wider animate-pulse">
                {unreadCount} NEW
              </span>
            )}
          </div>
          <button 
            onClick={toggleTheme}
            className="p-2 rounded-xl bg-app-surface/50 border border-white/5 hover:bg-app-primary/10 transition-colors"
          >
            <SlidersHorizontal className="w-4 h-4 text-app-primary" />
          </button>
        </div>

        {/* Search */}
        <div className="relative group">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-app-text-muted group-focus-within:text-app-primary transition-colors" />
          <input 
            type="text" 
            placeholder="Search messages..."
            className="w-full bg-app-surface border border-app-secondary/20 rounded-full py-3 pl-12 pr-4 text-sm text-white focus:ring-2 focus:ring-app-primary/20 outline-none transition-all"
          />
        </div>

        {/* View Tabs */}
        <div className="flex p-1 bg-app-surface/30 backdrop-blur-md rounded-2xl border border-white/5">
          <button 
            onClick={() => setView('chats')}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-medium transition-all ${
              view === 'chats' ? 'bg-app-surface text-white shadow-lg' : 'text-app-text-muted hover:text-white'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            Chats
          </button>
          <button 
            onClick={() => setView('saved')}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-medium transition-all ${
              view === 'saved' ? 'bg-app-surface text-white shadow-lg' : 'text-app-text-muted hover:text-white'
            }`}
          >
            <Bookmark className="w-3.5 h-3.5" />
            Saved
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 pb-20 custom-scrollbar z-10 relative">
        <AnimatePresence mode="wait">
          {view === 'chats' ? (
            <motion.div 
              key="chats"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-2"
            >
              <div className="flex items-center justify-between px-2 mb-2">
                <span className="text-[10px] font-bold text-app-text-muted uppercase tracking-widest">
                  Recent Chats ({chats.length})
                </span>
                <button 
                  onClick={() => setIsCreating(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-app-primary/10 text-app-primary hover:bg-app-primary/20 transition-all group"
                >
                  <Plus className="w-3.5 h-3.5 group-hover:rotate-90 transition-transform" />
                  <span className="text-[10px] font-bold uppercase tracking-wider">New Chat</span>
                </button>
              </div>

              {chats.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
                  <div className="w-16 h-16 rounded-3xl bg-app-surface/30 flex items-center justify-center border border-white/5">
                    <MessageSquare className="w-8 h-8 text-app-text-muted/30" />
                  </div>
                  <p className="text-sm text-app-text-muted">No active conversations</p>
                </div>
              ) : (
                chats.map((chat) => (
                  <motion.div
                    key={chat.id}
                    layout
                    onClick={() => onSelectChat(chat)}
                    className={`w-full p-4 flex items-center gap-4 rounded-3xl transition-all border relative group/item cursor-pointer ${
                      selectedChatId === chat.id 
                        ? 'bg-app-surface border-app-primary/30 shadow-xl scale-[1.02]' 
                        : 'bg-app-surface/30 border-white/5 hover:border-app-secondary/30'
                    }`}
                  >
                    <div className="relative">
                      <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-app-secondary/20 to-app-primary/20 flex items-center justify-center border border-white/5 group-hover/item:scale-105 transition-transform overflow-hidden">
                        {chat.type === 'group' ? (
                          <Users className="w-6 h-6 text-app-primary" />
                        ) : (
                          <span className="text-xl font-bold text-app-primary">
                            {(chat.recipient_username || chat.name || 'P')[0].toUpperCase()}
                          </span>
                        )}
                      </div>
                      {chat.unread_count > 0 && (
                        <div className="absolute -top-1 -right-1 w-5 h-5 bg-app-primary rounded-full border-2 border-app-bg flex items-center justify-center animate-bounce">
                          <span className="text-[10px] font-bold text-white">{chat.unread_count}</span>
                        </div>
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <h3 className="font-bold text-white truncate group-hover/item:text-app-primary transition-colors">
                          {chat.name || (chat.type === 'private' ? chat.recipient_username : 'Group Chat')}
                        </h3>
                        <span className="text-[10px] text-app-text-muted font-medium">
                          {chat.last_message_time ? new Date(chat.last_message_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                        </span>
                      </div>
                      <p className={`text-xs truncate ${chat.unread_count > 0 ? 'text-white font-semibold' : 'text-app-text-muted'}`}>
                        {chat.last_message || 'No messages yet'}
                      </p>
                    </div>

                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        if (window.confirm('Delete this chat?')) {
                          chatApi.delete(chat.id).then(() => {
                            fetchChats();
                            if (selectedChatId === chat.id) onSelectChat(null);
                          });
                        }
                      }}
                      className="p-2 opacity-0 group-hover/item:opacity-100 hover:bg-red-500/10 rounded-xl text-app-text-muted hover:text-red-400 transition-all"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </motion.div>
                ))
              )}
            </motion.div>
          ) : (
            <motion.div 
              key="saved"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-3"
            >
               <div className="px-2 mb-4">
                <span className="text-[10px] font-bold text-app-text-muted uppercase tracking-widest">
                  Saved Messages ({savedMessages.length})
                </span>
              </div>
              
              {savedMessages.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
                  <div className="w-16 h-16 rounded-3xl bg-app-surface/30 flex items-center justify-center border border-white/5">
                    <Bookmark className="w-8 h-8 text-app-text-muted/30" />
                  </div>
                  <p className="text-sm text-app-text-muted">No saved messages yet</p>
                </div>
              ) : (
                savedMessages.map((msg) => (
                  <div key={msg.id} className="p-4 bg-app-surface/40 backdrop-blur-md rounded-3xl border border-white/5 space-y-3 relative group">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                         <div className="w-6 h-6 rounded-lg bg-app-primary/10 flex items-center justify-center">
                            <MessageSquare className="w-3 h-3 text-app-primary" />
                         </div>
                         <span className="text-[10px] font-bold text-app-primary uppercase tracking-wider">{msg.chat_name || 'Private'}</span>
                      </div>
                      <span className="text-[10px] text-app-text-muted">{new Date(msg.timestamp).toLocaleDateString()}</span>
                    </div>
                    <p className="text-sm text-white leading-relaxed italic border-l-2 border-app-primary/30 pl-3">
                      "{msg.text || '[Encrypted]'}"
                    </p>
                    <div className="flex items-center justify-between pt-1">
                       <span className="text-[10px] text-app-text-muted">From: <span className="text-white">{msg.sender_nickname}</span></span>
                       <button onClick={(e) => toggleSaveMessage(e, msg.id)}>
                        <Bookmark className="w-4 h-4 text-app-primary fill-app-primary" />
                       </button>
                    </div>
                  </div>
                ))
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Profile Footer */}
      <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-app-bg to-transparent z-20">
        <div className="p-4 bg-app-surface/80 backdrop-blur-xl rounded-3xl border border-white/10 flex items-center justify-between shadow-2xl">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-app-primary to-app-secondary flex items-center justify-center text-white font-bold text-lg shadow-lg">
              {user?.nickname?.[0]?.toUpperCase()}
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-bold text-white leading-none mb-1">{user?.nickname}</span>
              <span className="text-[10px] text-app-text-muted">Online</span>
            </div>
          </div>
          <button 
            onClick={logout}
            className="p-2.5 rounded-2xl bg-white/5 hover:bg-red-500/10 text-app-text-muted hover:text-red-400 transition-all"
            title="Log Out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* New Chat Modal */}
      <AnimatePresence>
        {isCreating && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-app-bg/80 backdrop-blur-md p-4 flex flex-col"
          >
            <div className="flex-1 overflow-y-auto space-y-6 pt-10">
              <div className="flex items-center justify-between mb-8">
                <h2 className="text-2xl font-bold text-white">New Chat</h2>
                <button onClick={() => setIsCreating(false)} className="text-app-text-muted hover:text-white font-medium">Cancel</button>
              </div>

              <div className="space-y-4">
                <div className="relative group">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-app-text-muted group-focus-within:text-app-primary" />
                  <input 
                    type="text" 
                    placeholder="Search by nickname or email..."
                    value={searchQuery}
                    onChange={(e) => handleSearch(e.target.value)}
                    className="w-full bg-app-surface border border-white/5 rounded-2xl py-4 pl-12 pr-4 text-sm text-white focus:ring-2 focus:ring-app-primary/20 outline-none transition-all"
                  />
                </div>

                {selectedUsers.length > 0 && (
                  <div className="p-4 bg-app-surface/50 rounded-2xl border border-app-primary/20">
                    <p className="text-[10px] font-bold text-app-primary uppercase tracking-widest mb-3">Participants</p>
                    <div className="flex flex-wrap gap-2">
                      {selectedUsers.map(u => (
                        <span key={u.id} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-app-primary text-white text-xs font-bold shadow-lg">
                          {u.nickname}
                          <button onClick={() => setSelectedUsers(selectedUsers.filter(user => user.id !== u.id))} className="hover:rotate-90 transition-transform">×</button>
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {selectedUsers.length > 1 && (
                  <div className="space-y-2">
                     <p className="text-[10px] font-bold text-app-text-muted uppercase tracking-widest pl-2">Group Name</p>
                     <input 
                      type="text" 
                      value={groupName}
                      onChange={(e) => setGroupName(e.target.value)}
                      className="w-full bg-app-surface border border-white/5 rounded-2xl py-4 px-4 text-sm text-white focus:ring-2 focus:ring-app-primary/20 outline-none transition-all"
                      placeholder="Enter group name..."
                    />
                  </div>
                )}

                <div className="space-y-2">
                  {isSearching && <p className="text-center py-10 text-app-text-muted text-sm animate-pulse">Searching...</p>}
                  
                  {searchResults.map(u => (
                    <button
                      key={u.id}
                      onClick={() => {
                        if (!selectedUsers.find(user => user.id === u.id)) {
                          setSelectedUsers([...selectedUsers, u]);
                        }
                        setSearchQuery('');
                        setSearchResults([]);
                      }}
                      className="w-full p-4 flex items-center gap-4 bg-app-surface/40 backdrop-blur-md border border-white/5 hover:border-app-primary/40 rounded-3xl transition-all group"
                    >
                      <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-app-secondary/10 to-app-primary/10 flex items-center justify-center text-app-primary font-bold group-hover:scale-105 transition-transform">
                        {u.nickname[0].toUpperCase()}
                      </div>
                      <div className="flex-1 text-left">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-white">{u.nickname}</span>
                          {u.is_bot === 1 && <span className="text-[8px] bg-app-primary/20 text-app-primary px-1.5 py-0.5 rounded-sm font-black">BOT</span>}
                        </div>
                        <span className="text-[10px] text-app-text-muted">{u.email}</span>
                      </div>
                      <Plus className="w-4 h-4 text-app-primary opacity-0 group-hover:opacity-100 transition-opacity" />
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="p-6">
              {createError && <p className="text-red-400 text-xs text-center mb-4">{createError}</p>}
              <button 
                onClick={createChat}
                disabled={selectedUsers.length === 0 || isCreatingChat}
                className="w-full py-5 rounded-3xl bg-app-primary text-white font-bold shadow-2xl shadow-app-primary/20 disabled:opacity-50 disabled:shadow-none transition-all active:scale-95"
              >
                {isCreatingChat ? 'Creating...' : 'Start Conversation'}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
