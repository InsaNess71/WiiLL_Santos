import React, { useState, useEffect, useRef } from 'react';
import { collection, query, orderBy, onSnapshot, addDoc, serverTimestamp, doc, updateDoc, getDoc, setDoc, increment } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { Chat, ChatMessage, UserProfile } from '../types';
import { Send, Clock, AlertTriangle, ArrowLeft, User } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface ChatRoomProps {
  chatId: string;
  onBack: () => void;
}

export default function ChatRoom({ chatId, onBack }: ChatRoomProps) {
  const [chat, setChat] = useState<Chat | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [otherUser, setOtherUser] = useState<UserProfile | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const chatRef = doc(db, 'chats', chatId);
    const unsubscribeChat = onSnapshot(chatRef, async (snapshot) => {
      if (snapshot.exists()) {
        const chatData = { id: snapshot.id, ...snapshot.data() } as Chat;
        setChat(chatData);

        // Fetch other user's profile
        if (auth.currentUser) {
          const otherUserId = chatData.participants.find(id => id !== auth.currentUser?.uid);
          if (otherUserId) {
            const userSnap = await getDoc(doc(db, 'users', otherUserId));
            if (userSnap.exists()) {
              setOtherUser({ id: userSnap.id, ...userSnap.data() } as UserProfile);
            }
          }
        }
      } else {
        // Chat doesn't exist yet (lazy creation)
        const uids = chatId.split('_');
        setChat({
          id: chatId,
          participants: uids,
          durationMode: '24h',
          updatedAt: null,
          expiresAt: null
        } as unknown as Chat);

        // Fetch other user's profile even if chat doesn't exist
        if (auth.currentUser) {
          const otherUserId = uids.find(id => id !== auth.currentUser?.uid);
          if (otherUserId) {
            const userSnap = await getDoc(doc(db, 'users', otherUserId));
            if (userSnap.exists()) {
              setOtherUser({ id: userSnap.id, ...userSnap.data() } as UserProfile);
            }
          }
        }
      }
    });

    const q = query(
      collection(db, 'chats', chatId, 'messages'),
      orderBy('createdAt', 'asc')
    );
    const unsubscribeMessages = onSnapshot(q, (snapshot) => {
      const msgs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as ChatMessage[];
      setMessages(msgs);
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    });

    return () => {
      unsubscribeChat();
      unsubscribeMessages();
    };
  }, [chatId]);

  useEffect(() => {
    if (!auth.currentUser || !chatId || !chat) return;
    
    const myUnread = chat.unreadCount?.[auth.currentUser.uid] || 0;
    if (myUnread > 0) {
      const resetUnread = async () => {
        try {
          await updateDoc(doc(db, 'chats', chatId), {
            [`unreadCount.${auth.currentUser!.uid}`]: 0
          });
        } catch (e) {
          console.error("Error resetting unread count:", e);
        }
      };
      resetUnread();
    }
  }, [chatId, messages.length, chat]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !auth.currentUser || !chat) return;

    const text = newMessage.trim();
    setNewMessage('');

    try {
      const otherUserId = chat.participants.find(id => id !== auth.currentUser?.uid);
      
      const chatRef = doc(db, 'chats', chatId);
      const chatSnap = await getDoc(chatRef);

      if (!chatSnap.exists()) {
        // Create the chat document now that the first message is sent
        const expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + 24);

        await setDoc(chatRef, {
          participants: chat.participants,
          durationMode: '24h',
          expiresAt,
          updatedAt: serverTimestamp(),
          lastMessage: text,
          unreadCount: {
            [auth.currentUser.uid]: 0,
            [otherUserId!]: 1
          }
        });
      } else {
        // Update existing chat
        const updateData: any = {
          updatedAt: serverTimestamp(),
          lastMessage: text
        };
        
        if (otherUserId) {
          updateData[`unreadCount.${otherUserId}`] = increment(1);
        }
        
        await updateDoc(chatRef, updateData);
      }

      // Add the message
      await addDoc(collection(db, 'chats', chatId, 'messages'), {
        senderId: auth.currentUser.uid,
        text,
        createdAt: serverTimestamp(),
        isSystem: false
      });
      
    } catch (error) {
      console.error("Error sending message:", error);
    }
  };

  const handleChangeDuration = async (mode: '1h' | '24h') => {
    if (!chat || chat.durationMode === mode || !auth.currentUser) return;
    
    const hours = mode === '1h' ? 1 : 24;
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + hours);

    try {
      await updateDoc(doc(db, 'chats', chatId), {
        durationMode: mode,
        expiresAt
      });

      await addDoc(collection(db, 'chats', chatId, 'messages'), {
        senderId: auth.currentUser.uid,
        text: `O tempo do chat foi alterado para ${hours} hora${hours > 1 ? 's' : ''}.`,
        createdAt: serverTimestamp(),
        isSystem: true
      });
    } catch (error) {
      console.error("Error changing duration:", error);
    }
  };

  if (!chat) return null;

  const isExpired = chat.expiresAt?.toDate && chat.expiresAt.toDate() < new Date();

  return (
    <div className="flex flex-col h-[600px] max-h-[80vh] bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden shadow-2xl">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-zinc-800 bg-zinc-950/50">
        <div className="flex items-center space-x-3">
          <button onClick={onBack} className="text-zinc-400 hover:text-zinc-200">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="w-10 h-10 bg-pink-600/20 rounded-full flex items-center justify-center text-pink-500 shrink-0 overflow-hidden">
            {otherUser?.avatar ? (
              <img src={otherUser.avatar} alt="Avatar" className="w-full h-full object-cover" />
            ) : (
              <User className="w-5 h-5" />
            )}
          </div>
          <div>
            <h3 className="font-medium text-zinc-100">
              {otherUser ? otherUser.nickname : 'Usuário Anônimo'}
            </h3>
            <div className="flex items-center space-x-1 text-xs text-zinc-500">
              <Clock className="w-3 h-3" />
              <span>Expira em: {chat.expiresAt?.toDate ? formatDistanceToNow(chat.expiresAt.toDate(), { locale: ptBR }) : 'Após a 1ª mensagem'}</span>
            </div>
          </div>
        </div>
        
        <div className="flex bg-zinc-900 rounded-lg p-1 border border-zinc-800">
          <button 
            onClick={() => handleChangeDuration('1h')}
            className={`px-2 py-1 text-xs font-medium rounded-md transition-colors ${chat.durationMode === '1h' ? 'bg-pink-600 text-white' : 'text-zinc-400 hover:text-zinc-200'}`}
          >
            1h
          </button>
          <button 
            onClick={() => handleChangeDuration('24h')}
            className={`px-2 py-1 text-xs font-medium rounded-md transition-colors ${chat.durationMode === '24h' ? 'bg-pink-600 text-white' : 'text-zinc-400 hover:text-zinc-200'}`}
          >
            24h
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
        {isExpired ? (
          <div className="flex flex-col items-center justify-center h-full text-zinc-500 space-y-2">
            <AlertTriangle className="w-8 h-8 text-yellow-500/50" />
            <p>Este chat expirou e não pode mais receber mensagens.</p>
          </div>
        ) : (
          <>
            <div className="text-center">
              <span className="inline-block px-3 py-1 bg-zinc-800/50 text-zinc-400 text-xs rounded-full">
                Chat temporário iniciado. As mensagens sumirão em {chat.durationMode === '1h' ? '1 hora' : '24 horas'}.
              </span>
            </div>
            {messages.map(msg => {
              if (msg.isSystem) {
                return (
                  <div key={msg.id} className="text-center">
                    <span className="inline-block px-3 py-1 bg-pink-500/10 text-pink-400 text-xs rounded-full border border-pink-500/20">
                      {msg.text}
                    </span>
                  </div>
                );
              }

              const isMe = msg.senderId === auth.currentUser?.uid;
              return (
                <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[75%] rounded-2xl px-4 py-2 ${isMe ? 'bg-pink-600 text-white rounded-tr-sm' : 'bg-zinc-800 text-zinc-100 rounded-tl-sm'}`}>
                    <p className="text-sm">{msg.text}</p>
                    <span className={`text-[10px] mt-1 block ${isMe ? 'text-pink-200' : 'text-zinc-500'}`}>
                      {msg.createdAt?.toDate ? formatDistanceToNow(msg.createdAt.toDate(), { addSuffix: true, locale: ptBR }) : 'agora'}
                    </span>
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Input */}
      <div className="p-4 border-t border-zinc-800 bg-zinc-950/50">
        <form onSubmit={handleSendMessage} className="flex items-center space-x-2">
          <input
            type="text"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            disabled={isExpired}
            placeholder={isExpired ? "Chat expirado" : "Digite uma mensagem..."}
            className="flex-1 bg-zinc-900 border border-zinc-700 rounded-full px-4 py-2.5 text-sm text-zinc-100 focus:outline-none focus:border-pink-500/50 focus:ring-1 focus:ring-pink-500/50 transition-all disabled:opacity-50"
            maxLength={1000}
          />
          <button
            type="submit"
            disabled={!newMessage.trim() || isExpired}
            className="p-2.5 rounded-full bg-pink-600 text-white disabled:opacity-50 disabled:cursor-not-allowed hover:bg-pink-500 transition-colors shrink-0"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
}
