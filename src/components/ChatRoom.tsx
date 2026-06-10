import React, { useState, useEffect, useRef } from 'react';
import { collection, query, orderBy, onSnapshot, addDoc, serverTimestamp, doc, updateDoc, getDoc, setDoc, increment, writeBatch } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, auth, storage, handleFirestoreError, OperationType } from '../firebase';
import { Chat, ChatMessage, UserProfile } from '../types';
import { Send, Clock, AlertTriangle, ArrowLeft, User, X, ImageIcon, Loader2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { getUserProfile } from '../lib/userCache';

interface ChatRoomProps {
  chatId: string;
  onBack: () => void;
}

export default function ChatRoom({ chatId, onBack }: ChatRoomProps) {
  const [chat, setChat] = useState<Chat | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [otherUser, setOtherUser] = useState<UserProfile | null>(null);
  const [currentUserProfile, setCurrentUserProfile] = useState<UserProfile | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const fetchProfiles = async () => {
      if (auth.currentUser) {
        const profile = await getUserProfile(auth.currentUser.uid);
        setCurrentUserProfile(profile);
      }
    };
    fetchProfiles();
  }, []);

  useEffect(() => {
    const chatRef = doc(db, 'chats', chatId);
    console.log(`[ChatRoom] Setting up chat listener for chat: ${chatId}`);
    const unsubscribeChat = onSnapshot(chatRef, async (snapshot) => {
      if (snapshot.exists()) {
        const chatData = { id: snapshot.id, ...snapshot.data() } as Chat;
        console.log(`[ChatRoom] chat onSnapshot triggered for chat ${chatId}:`, chatData);
        setChat(chatData);

        // Fetch other user's profile
        if (auth.currentUser) {
          const otherUserId = chatData.participants.find(id => id !== auth.currentUser?.uid);
          if (otherUserId) {
            console.log(`[ChatRoom] Fetching other user profile: ${otherUserId}`);
            const userSnap = await getDoc(doc(db, 'users', otherUserId));
            if (userSnap.exists()) {
              setOtherUser({ id: userSnap.id, ...userSnap.data() } as UserProfile);
            } else {
               console.log(`[ChatRoom] Other user profile not found: ${otherUserId}`);
            }
          }
        }
      } else {
        console.log(`[ChatRoom] Chat ${chatId} does not exist in snapshot.`);
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
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, `chats/${chatId}`);
    });

    const q = query(
      collection(db, 'chats', chatId, 'messages'),
      orderBy('createdAt', 'asc')
    );
    console.log(`[ChatRoom] Setting up messages listener for chat: ${chatId}`);
    
    const unsubscribeMessages = onSnapshot(q, (snapshot) => {
      console.log(`[ChatRoom] messages onSnapshot triggered. Documents found: ${snapshot.docs.length}`);
      const msgs = snapshot.docs.map(doc => {
        const data = doc.data({ serverTimestamps: 'estimate' });
        console.log(`[ChatRoom] processing message ${doc.id}:`, data);
        return { id: doc.id, ...data } as ChatMessage;
      });
      console.log(`[ChatRoom] Setting ${msgs.length} messages into state`);
      setMessages(msgs);
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    }, (error) => {
      console.error(`[ChatRoom] Error fetching messages for chat ${chatId}:`, error);
      handleFirestoreError(error, OperationType.LIST, `chats/${chatId}/messages`);
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
    if ((!newMessage.trim() && !imageFile) || !auth.currentUser || !chat || isUploading) return;

    const text = newMessage.trim();
    setNewMessage('');
    setIsUploading(true);

    try {
      let imageUrl = '';
      if (imageFile) {
        const fileExt = imageFile.name.split('.').pop();
        const fileName = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}.${fileExt}`;
        const imageRef = ref(storage, `chats/${chatId}/${auth.currentUser.uid}/${fileName}`);
        await uploadBytes(imageRef, imageFile);
        imageUrl = await getDownloadURL(imageRef);
        setImageFile(null);
      }

      const otherUserId = chat.participants.find(id => id !== auth.currentUser?.uid);
      const chatRef = doc(db, 'chats', chatId);
      const chatSnap = await getDoc(chatRef);
      const messageRef = doc(collection(db, 'chats', chatId, 'messages'));
      const batch = writeBatch(db);

      const lastMessageText = text || '📷 Imagem';

      if (!chatSnap.exists()) {
        const expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + 24);
        batch.set(chatRef, {
          participants: chat.participants,
          durationMode: '24h',
          expiresAt,
          updatedAt: serverTimestamp(),
          lastMessage: lastMessageText,
          unreadCount: {
            [auth.currentUser.uid]: 0,
            [otherUserId!]: 1
          }
        });
      } else {
        const updateData: any = {
          updatedAt: serverTimestamp(),
          lastMessage: lastMessageText
        };
        if (otherUserId) {
          updateData[`unreadCount.${otherUserId}`] = increment(1);
        }
        batch.update(chatRef, updateData);
      }

      const messageData: any = {
        senderId: auth.currentUser.uid,
        text,
        createdAt: new Date(),
        isSystem: false
      };
      if (imageUrl) {
        messageData.imageUrl = imageUrl;
      }
      batch.set(messageRef, messageData);
      
      await batch.commit();

      // Attempt to send push notification via API (won't fail message if notification fails)
      if (otherUserId) {
        fetch('/api/notify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: otherUserId,
            title: `Mensagem de ${currentUserProfile?.nickname || 'Alguém'}`,
            body: lastMessageText,
            data: { chatId, type: 'chat' }
          })
        }).catch(() => {}); // Suppress 'Failed to fetch' error
      }

    } catch (error) {
      console.error("Error sending message:", error);
      alert('Erro ao enviar mensagem. Tente novamente.');
    } finally {
      setIsUploading(false);
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
        createdAt: new Date(),
        isSystem: true
      });
    } catch (error) {
      console.error("Error changing duration:", error);
    }
  };

  if (!chat) return null;

  const isExpired = false; // Chat never expires

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
                    {msg.imageUrl && (
                      <img src={msg.imageUrl} alt="Imagem da mensagem" className="rounded-xl w-full max-w-[250px] mb-2" />
                    )}
                    {msg.text && <p className="text-sm">{msg.text}</p>}
                    <span className={`text-[10px] mt-1 block ${isMe ? 'text-pink-200' : 'text-zinc-500'}`}>
                      {msg.createdAt instanceof Date 
                        ? formatDistanceToNow(msg.createdAt, { addSuffix: true, locale: ptBR })
                        : msg.createdAt?.toDate 
                          ? formatDistanceToNow(msg.createdAt.toDate(), { addSuffix: true, locale: ptBR }) 
                          : 'agora'}
                    </span>
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {imageFile && (
        <div className="px-4 py-2 border-t border-zinc-800 bg-zinc-900 flex items-center justify-between">
          <div className="flex items-center space-x-2 text-sm text-zinc-300">
            <ImageIcon className="w-4 h-4 text-pink-500" />
            <span className="truncate max-w-[200px]">{imageFile.name}</span>
          </div>
          <button 
            onClick={() => setImageFile(null)}
            className="p-1 hover:bg-zinc-800 rounded text-zinc-500 hover:text-zinc-300"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Input */}
      <div className="p-4 border-t border-zinc-800 bg-zinc-950/50">
        <form onSubmit={handleSendMessage} className="flex items-center space-x-2">
          <input
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            ref={fileInputRef}
            onChange={(e) => {
              if (e.target.files && e.target.files[0]) {
                setImageFile(e.target.files[0]);
              }
            }}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isExpired || isUploading}
            className="p-2.5 rounded-full bg-zinc-800 text-zinc-400 hover:text-zinc-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shrink-0"
          >
            <ImageIcon className="w-5 h-5" />
          </button>
          <input
            type="text"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            disabled={isExpired || isUploading}
            placeholder={isExpired ? "Chat expirado" : "Digite uma mensagem..."}
            className="flex-1 bg-zinc-900 border border-zinc-700 rounded-full px-4 py-2.5 text-sm text-zinc-100 focus:outline-none focus:border-pink-500/50 focus:ring-1 focus:ring-pink-500/50 transition-all disabled:opacity-50"
            maxLength={1000}
          />
          <button
            type="submit"
            disabled={(!newMessage.trim() && !imageFile) || isExpired || isUploading}
            className="p-2.5 rounded-full bg-pink-600 text-white disabled:opacity-50 disabled:cursor-not-allowed hover:bg-pink-500 transition-colors shrink-0"
          >
            {isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </button>
        </form>
      </div>
    </div>
  );
}
