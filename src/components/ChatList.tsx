import React, { useState, useEffect, useRef } from 'react';
import { collection, query, where, onSnapshot, getDoc, doc } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { Chat, UserProfile } from '../types';
import { MessageSquare, Clock, Ghost, User } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import ChatRoom from './ChatRoom';

interface ChatListProps {
  activeChatId: string | null;
  setActiveChatId: (id: string | null) => void;
}

export default function ChatList({ activeChatId, setActiveChatId }: ChatListProps) {
  const [chats, setChats] = useState<(Chat & { otherUser?: UserProfile })[]>([]);
  const [loading, setLoading] = useState(true);
  const userCache = useRef<Record<string, UserProfile>>({});

  useEffect(() => {
    if (!auth.currentUser) return;

    const q = query(
      collection(db, 'chats'),
      where('participants', 'array-contains', auth.currentUser.uid)
    );

    const unsubscribe = onSnapshot(q, async (snapshot) => {
      const now = new Date();
      const chatPromises = snapshot.docs.map(async (docSnap) => {
        const data = docSnap.data() as Chat;
        const chat = { id: docSnap.id, ...data };
        
        // Filter out expired chats locally
        if (chat.expiresAt?.toDate && chat.expiresAt.toDate() < now) {
          return null;
        }

        const otherUserId = chat.participants.find(id => id !== auth.currentUser?.uid);
        if (otherUserId) {
          if (userCache.current[otherUserId]) {
            return { ...chat, otherUser: userCache.current[otherUserId] };
          } else {
            const userSnap = await getDoc(doc(db, 'users', otherUserId));
            if (userSnap.exists()) {
              const userData = { id: userSnap.id, ...userSnap.data() } as UserProfile;
              userCache.current[otherUserId] = userData;
              return { ...chat, otherUser: userData };
            }
          }
        }
        return chat;
      });

      const resolvedChats = (await Promise.all(chatPromises)).filter(Boolean) as (Chat & { otherUser?: UserProfile })[];
      
      // Sort by updatedAt descending
      resolvedChats.sort((a, b) => {
        const timeA = a.updatedAt?.toDate?.()?.getTime() || 0;
        const timeB = b.updatedAt?.toDate?.()?.getTime() || 0;
        return timeB - timeA;
      });

      setChats(resolvedChats);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  if (activeChatId) {
    return <ChatRoom chatId={activeChatId} onBack={() => setActiveChatId(null)} />;
  }

  if (loading) {
    return (
      <div className="flex justify-center p-8">
        <Ghost className="w-8 h-8 text-pink-500 animate-pulse" />
      </div>
    );
  }

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden shadow-xl">
      <div className="p-4 border-b border-zinc-800 bg-zinc-950/50">
        <h2 className="text-lg font-semibold text-zinc-100 flex items-center space-x-2">
          <MessageSquare className="w-5 h-5 text-pink-500" />
          <span>Chats Temporários</span>
        </h2>
      </div>

      <div className="divide-y divide-zinc-800 max-h-[500px] overflow-y-auto custom-scrollbar">
        {chats.length === 0 ? (
          <div className="p-8 text-center text-zinc-500">
            <MessageSquare className="w-8 h-8 mx-auto mb-3 opacity-50" />
            <p>Você não tem conversas ativas.</p>
          </div>
        ) : (
          chats.map(chat => {
            const unread = auth.currentUser ? (chat.unreadCount?.[auth.currentUser.uid] || 0) : 0;
            
            return (
              <button
                key={chat.id}
                onClick={() => setActiveChatId(chat.id)}
                className="w-full text-left p-4 hover:bg-zinc-800/50 transition-colors flex items-center space-x-3 group"
              >
                <div className="w-12 h-12 bg-pink-600/20 rounded-full flex items-center justify-center text-pink-500 shrink-0 overflow-hidden">
                  {chat.otherUser?.avatar ? (
                    <img src={chat.otherUser.avatar} alt="Avatar" className="w-full h-full object-cover" />
                  ) : (
                    <User className="w-6 h-6" />
                  )}
                </div>
                <div className="flex-1 pr-4 truncate">
                  <h3 className="font-medium text-zinc-100 group-hover:text-pink-400 transition-colors">
                    {chat.otherUser ? chat.otherUser.nickname : 'Usuário Anônimo'}
                  </h3>
                  {chat.lastMessage && (
                    <p className={`text-sm mt-0.5 truncate ${unread > 0 ? 'text-zinc-200 font-medium' : 'text-zinc-500'}`}>
                      {chat.lastMessage}
                    </p>
                  )}
                  <div className="flex items-center space-x-1 text-xs text-zinc-500 mt-1">
                    <Clock className="w-3 h-3" />
                    <span>Expira em: {chat.expiresAt?.toDate ? formatDistanceToNow(chat.expiresAt.toDate(), { locale: ptBR }) : '...'}</span>
                  </div>
                </div>
                {unread > 0 && (
                  <div className="bg-pink-500 text-white text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center shrink-0">
                    {unread > 99 ? '99+' : unread}
                  </div>
                )}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
