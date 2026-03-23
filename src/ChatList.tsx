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
            ? { ...c, unread_count: (c.unread_count || 0) + 1,
                last_message: message.encrypted_text || message.ciphertext,
                last_message_time: message.timestamp }
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
    }
  }, [selectedChatId]);

  useEffect(() => {
    const totalUnread = chats.filter((c: any) => c.unread_count > 0).length;
    setUnreadCount(totalUnread);
  }, [chats]);

  const fetchChats = async () => {
    try {
      const data = await chatApi.list();
      
      const chatsWithUnread = await Promise.all(data.map(async (chat: any) => {
        try {
          const messages = await chatApi.getMessages(chat.id);
          const unread = messages.filter((m: any) =>
            m.sender_id !== user?.id && !m.is_read
          ).length;
          const lastMsg = messages[messages.length - 1];
          return {
            ...chat,
            unread_count: unread,
            last_message: lastMsg?.encrypted_text || lastMsg?.ciphertext || '',
            last_message_time: lastMsg?.timestamp || chat.created_at
          };
        } catch {
          return { ...chat, unread_count: 0 };
        }
      }));
      
      setChats(chatsWithUnread);
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
    console.log('Searching for:', trimmedQuery);
    if (trimmedQuery.length < 1) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }
    
    setIsSearching(true);
    try {
      const data = await userApi.search(trimmedQuery);
      console.log('Search results:', data);
      setSearchResults(data);
    } catch (err: any) {
      console.error('Search failed:', err.message, err);
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
      
      // Check if a private chat already exists with this user
      if (type === 'private') {
        const existingChat = chats.find(c => 
          c.type === 'private' && 
          c.participant_ids?.includes(selectedUsers[0].id)
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
        encryptedKeys: {} // Keys will be established via X3DH on first message
      });

      setIsCreating(false);
      setSelectedUsers([]);
      setGroupName('');
      await new Promise(r => setTimeout(r, 300));
      fetchChats();
      onSelectChat(newChat);
    } catch (err: any) {
      console.error('Failed to create chat', err);
      setCreateError(err.message || 'Failed to create chat. Please try again.');
    } finally {
      setIsCreatingChat(false);
    }
  };

  const toggleSaveMessage = async (e: React.MouseEvent, messageId: number) => {
    e.stopPropagation();
    try {
      await chatApi.toggleSaveMessage(messageId);
      await new Promise(r => setTimeout(r, 300));
      fetchSavedMessages();
    } catch (err) {
      console.error('Failed to toggle save message', err);
    }
  };

  return (
    <div className="w-full h-full flex flex-col bg-app-sidebar/80 backdrop-blur-md border-r border-app-secondary/30">
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-medium text-white">Messages</h2>
            {unreadCount > 0 && (
              <span className="px-2 py-0.5 bg-app-primary/20 text-app-primary text-[10px] font-bold rounded-full border border-app-primary/30">
                {unreadCount} NEW
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[9px] font-bold uppercase tracking-widest text-app-text-muted">
              {theme === 'elegant' ? 'Hybrid' : 'Vibrant'}
            </span>
            <button 
              onClick={toggleTheme}
              className={`w-8 h-4 rounded-full relative transition-all duration-200 border ${
                theme === 'elegant' 
                  ? 'bg-app-primary border-app-primary' 
                  : 'bg-app-surface border-app-secondary/40'
              }`}
            >
              <div className={`absolute top-0.5 w-2.5 h-2.5 rounded-full bg-white transition-all duration-200 ${
                theme === 'elegant' ? 'right-0.5' : 'left-0.5'
              }`} />
            </button>
          </div>
        </div>

        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-app-text-muted" />
          <input
            type="text"
            placeholder="Search messages..."
            className="w-full bg-app-surface border border-app-secondary/20 rounded-full py-3 pl-12 pr-4 text-sm text-white focus:ring-2 focus:ring-app-primary/20 outline-none transition-all"
          />
        </div>

      </div>

      <div className="p-1 overflow-y-auto px-6">
        {view === 'chats' ? (
          <>
            <div className="flex items-center justify-between mb-4">
              <span className="text-[10px] font-bold tracking-widest text-app-text-muted uppercase">
                Recent Chats ({chats.length})
              </span>
              <button 
                onClick={() => setIsCreating(true)}
                title="Create new conversation"
                className="text-app-primary text-xs font-medium hover:underline"
              >
                New Chat
              </button>
            </div>

            <div className="space-y-3 pb-6">
              {chats.length === 0 ? (
                <div className="py-12 text-center text-app-text-muted">
                  <p className="text-sm italic">No active conversations</p>
                </div>
              ) : (
                chats.map((chat) => (
                  <div
                    key={chat.id}
                    role="button"
                    onClick={() => onSelectChat(chat)}
                    className={`w-full p-4 flex items-center gap-4 rounded-3xl transition-all border relative group/item cursor-pointer ${
                      selectedChatId === chat.id 
                        ? 'bg-app-surface border-app-primary/30 shadow-lg border-l-4 border-l-app-primary' 
                        : 'bg-app-surface/30 border-transparent hover:border-app-secondary/30'
                    }`}
                  >
                    <div className="w-14 h-14 bg-gradient-to-br from-app-primary to-app-primary/40 rounded-2xl flex items-center justify-center text-white font-bold text-xl shadow-inner">
                      {chat.type === 'group' ? <Users className="w-7 h-7" /> : (chat.recipient_username || chat.name || 'P')[0].toUpperCase()}
                    </div>
                    <div className="flex-1 text-left overflow-hidden">
                      <div className="flex justify-between items-baseline mb-1">
                        <h3 className="font-medium text-white truncate">{chat.name || (chat.type === 'private' ? 'Private Chat' : chat.recipient_username || 'Chat')}</h3>
                        <span className="text-[10px] text-app-text-muted">
                          {chat.last_message_time ? new Date(chat.last_message_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <p className={`text-xs truncate flex-1 ${chat.unread_count > 0 ? 'text-white font-medium' : 'text-app-text-muted'}`}>
                          {chat.last_message || 'No messages yet'}
                        </p>
                        {chat.unread_count > 0 && (
                          <span className="ml-2 w-5 h-5 bg-app-primary rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0 shadow-lg shadow-app-primary/20">
                            {chat.unread_count}
                          </span>
                        )}
                        <button
                          onClick={async (e) => {
                            e.stopPropagation();
                            if (window.confirm('Delete this chat?')) {
                              try {
                                await chatApi.delete(chat.id);
                                fetchChats();
                                if (selectedChatId === chat.id) {
                                  onSelectChat(null);
                                }
                              } catch (err) {
                                console.error('Delete chat error:', err);
                              }
                            }
                          }}
                          className="ml-2 p-1.5 opacity-0 group-hover/item:opacity-100 hover:bg-red-500/10 rounded-lg text-app-text-muted hover:text-red-400 transition-all"
                          title="Delete Chat"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center justify-between mb-4">
              <span className="text-[10px] font-bold tracking-widest text-app-text-muted uppercase">Saved Messages ({savedMessages.length})</span>
            </div>
            <div className="space-y-3 pb-6">
              {savedMessages.length === 0 ? (
                <div className="py-12 text-center text-app-text-muted">
                  <p className="text-sm italic">No saved messages yet</p>
                </div>
              ) : (
                savedMessages.map((msg) => (
                  <div
                    key={msg.id}
                    className="w-full p-4 bg-app-surface/30 border border-app-secondary/10 rounded-3xl transition-all relative group/item"
                  >
                    <div className="flex justify-between items-baseline mb-2">
                      <span className="text-[10px] font-bold text-app-primary uppercase tracking-widest">{msg.chat_name || 'Private Chat'}</span>
                      <span className="text-[9px] text-app-text-muted">{new Date(msg.timestamp).toLocaleDateString()}</span>
                    </div>
                    <p className="text-sm text-white/80 line-clamp-3 mb-2 italic">"{msg.text || '[Encrypted]'}"</p>
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] text-app-text-muted">From: {msg.sender_nickname}</span>
                      <Bookmark 
                        onClick={(e) => toggleSaveMessage(e, msg.id)}
                        title="Remove from saved"
                        className="w-4 h-4 text-app-primary fill-app-primary cursor-pointer"
                      />
                    </div>
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </div>

      <div className="p-6 border-t border-app-secondary/20 flex justify-between items-center bg-app-sidebar/80 backdrop-blur-md">
        <div className="flex items-center gap-3 overflow-hidden">
          <Users title="Contacts" className="w-6 h-6 text-app-text-muted hover:text-white cursor-pointer transition-colors shrink-0" />
          <span className="text-sm font-medium text-white truncate">{user?.nickname}</span>
        </div>
        <LogOut onClick={logout} title="Logout" className="w-6 h-6 text-app-text-muted hover:text-red-400 cursor-pointer transition-colors shrink-0" />
      </div>

      <AnimatePresence>
        {isCreating && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="absolute inset-0 z-50 bg-app-bg p-6 flex flex-col overflow-hidden"
          >
            <BackgroundPattern primaryColor={theme === 'elegant' ? '180, 130, 70' : '234, 179, 8'} opacity={0.3} />
            <div className="relative z-10 flex flex-col h-full">
              <div className="flex items-center justify-between mb-8">
                <h2 className="text-2xl font-medium text-white">New Chat</h2>
                <button onClick={() => setIsCreating(false)} className="text-app-text-muted hover:text-white">Cancel</button>
              </div>

            <div className="relative mb-6">
              <Search className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-app-text-muted" />
              <input
                type="text"
                placeholder="Search by nickname or email..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  handleSearch(e.target.value);
                }}
                className="input-field pr-12"
              />
            </div>

            {selectedUsers.length > 0 && (
              <div className="mb-6">
                <p className="text-[10px] font-bold text-app-text-muted uppercase tracking-widest mb-3">Participants</p>
                <div className="flex flex-wrap gap-2">
                  {selectedUsers.map(u => (
                    <span key={u.id} className="bg-app-primary/20 text-app-primary px-4 py-1.5 rounded-full text-xs font-medium flex items-center gap-2">
                      {u.nickname}
                      <button onClick={() => setSelectedUsers(selectedUsers.filter(user => user.id !== u.id))} className="hover:text-white">×</button>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {selectedUsers.length > 1 && (
              <div className="mb-6">
                <label className="text-sm font-medium text-app-text-muted mb-2 block">Group Name</label>
                <input
                  type="text"
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  className="input-field"
                  placeholder="Enter group name..."
                />
              </div>
            )}

            <div className="flex-1 overflow-y-auto space-y-3">
              {isSearching && (
                <div className="py-8 text-center text-app-text-muted">
                  <p className="text-sm animate-pulse">Searching...</p>
                </div>
              )}
              {!isSearching && searchResults.length === 0 && searchQuery.trim().length > 0 && (
                <div className="py-8 text-center text-app-text-muted">
                  <p className="text-sm italic">No users found matching "{searchQuery}"</p>
                </div>
              )}
              {!isSearching && searchResults.map(u => (
                <button
                  key={u.id}
                  onClick={() => {
                    if (!selectedUsers.find(user => user.id === u.id)) {
                      setSelectedUsers([...selectedUsers, u]);
                    }
                    setSearchQuery('');
                    setSearchResults([]);
                  }}
                  className="w-full p-4 flex items-center gap-4 bg-app-surface/40 backdrop-blur-md border border-app-secondary/20 hover:border-app-primary/40 rounded-3xl transition-all"
                >
                  <div className="w-12 h-12 bg-app-primary/10 rounded-2xl flex items-center justify-center text-app-primary font-bold text-lg border border-app-primary/20">
                    {u.nickname[0].toUpperCase()}
                  </div>
                  <div className="text-left flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-white font-medium">{u.nickname}</p>
                      {u.is_bot === 1 && (
                        <span className="bg-app-primary/20 text-app-primary px-1.5 py-0.5 rounded text-[8px] font-bold">BOT</span>
                      )}
                    </div>
                    <p className="text-xs text-app-text-muted">{u.email}</p>
                  </div>
                </button>
              ))}
            </div>

            {createError && (
              <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-2xl text-red-400 text-xs text-center">
                {createError}
              </div>
            )}

            <button
              onClick={createChat}
              disabled={selectedUsers.length === 0 || isCreatingChat}
              className="btn-primary w-full mt-6 flex items-center justify-center gap-2"
            >
              {isCreatingChat ? (
                <>
                  <Plus className="w-4 h-4 animate-spin" />
                  Creating...
                </>
              ) : (
                'Start Conversation'
              )}
            </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

