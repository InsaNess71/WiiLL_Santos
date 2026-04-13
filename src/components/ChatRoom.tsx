import React, { useState, useEffect, useRef } from 'react';
import { collection, query, orderBy, onSnapshot, addDoc, serverTimestamp, doc, updateDoc, getDoc, setDoc, increment } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { db, auth, storage, handleFirestoreError, OperationType } from '../firebase';
import { Chat, ChatMessage, UserProfile } from '../types';
import { Send, Clock, AlertTriangle, ArrowLeft, User, Camera, Crown, Trash2, X, Upload, Loader2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import PremiumModal from './PremiumModal';
import { getUserProfile, isPremiumActive } from '../lib/userCache';

interface ChatRoomProps {
  chatId: string;
  onBack: () => void;
}

export default function ChatRoom({ chatId, onBack }: ChatRoomProps) {
  const [chat, setChat] = useState<Chat | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [otherUser, setOtherUser] = useState<UserProfile | null>(null);
  const [currentUserProfile, setCurrentUserProfile] = useState<UserProfile | null>(null);
  const [showPremiumModal, setShowPremiumModal] = useState(false);
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
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, `chats/${chatId}`);
    });

    const q = query(
      collection(db, 'chats', chatId, 'messages'),
      orderBy('createdAt', 'asc')
    );
    const unsubscribeMessages = onSnapshot(q, (snapshot) => {
      const msgs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as ChatMessage[];
      setMessages(msgs);
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    }, (error) => {
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
    if ((!newMessage.trim() && !imageUrl) || !auth.currentUser || !chat || isUploading) return;

    const text = newMessage.trim();
    const currentImageUrl = imageUrl;
    setNewMessage('');
    setImageUrl('');

    try {
      // Use the new server-side API for better scalability and push notifications
      const response = await fetch('/api/send-chat-message', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // In a real app, you would add the auth token here
          // 'Authorization': `Bearer ${await auth.currentUser.getIdToken()}`
        },
        body: JSON.stringify({
          chatId,
          text,
          senderId: auth.currentUser.uid,
          imageUrl: isPremiumActive(currentUserProfile) ? currentImageUrl : null
        })
      });

      if (!response.ok) {
        const text = await response.text();
        let errorMessage = 'Erro ao enviar mensagem via API';
        try {
          const errorData = JSON.parse(text);
          errorMessage = errorData.error || errorMessage;
        } catch (e) {
          errorMessage = `Erro no servidor (${response.status}): ${text.slice(0, 100)}...`;
        }
        throw new Error(errorMessage);
      }
      
    } catch (error) {
      console.error("Error sending message via API:", error);
      // Fallback to direct Firestore write if API fails (optional, but good for resilience)
      try {
        const otherUserId = chat.participants.find(id => id !== auth.currentUser?.uid);
        const chatRef = doc(db, 'chats', chatId);
        const chatSnap = await getDoc(chatRef);

        if (!chatSnap.exists()) {
          const expiresAt = new Date();
          expiresAt.setHours(expiresAt.getHours() + 24);
          await setDoc(chatRef, {
            participants: chat.participants,
            durationMode: '24h',
            expiresAt,
            updatedAt: serverTimestamp(),
            lastMessage: text || '📷 Foto',
            unreadCount: {
              [auth.currentUser.uid]: 0,
              [otherUserId!]: 1
            }
          });
        } else {
          const updateData: any = {
            updatedAt: serverTimestamp(),
            lastMessage: text || '📷 Foto'
          };
          if (otherUserId) {
            updateData[`unreadCount.${otherUserId}`] = increment(1);
          }
          await updateDoc(chatRef, updateData);
        }

        const messageData: any = {
          senderId: auth.currentUser.uid,
          text,
          createdAt: serverTimestamp(),
          isSystem: false
        };
        if (isPremiumActive(currentUserProfile) && currentImageUrl) {
          messageData.imageUrl = currentImageUrl;
        }
        await addDoc(collection(db, 'chats', chatId, 'messages'), messageData);
      } catch (fallbackError) {
        console.error("Fallback message sending failed:", fallbackError);
      }
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

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !auth.currentUser) return;

    if (!isPremiumActive(currentUserProfile)) {
      setShowPremiumModal(true);
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      alert('A imagem deve ter no máximo 5MB.');
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);

    try {
      const fileName = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.]/g, '_')}`;
      const storageRef = ref(storage, `chats/${chatId}/${auth.currentUser.uid}/${fileName}`);
      
      console.log("Starting chat upload to:", storageRef.fullPath);
      const uploadTask = uploadBytesResumable(storageRef, file);

      uploadTask.on('state_changed', 
        (snapshot) => {
          const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
          setUploadProgress(progress);
        }, 
        (error) => {
          console.error("Detailed chat upload error:", error);
          let errorMessage = 'Erro ao enviar imagem.';
          if (error.code === 'storage/unauthorized') {
            errorMessage = 'Sem permissão. O Firebase Storage pode não estar ativado.';
          } else {
            errorMessage = `Erro (${error.code}): ${error.message}`;
          }
          alert(errorMessage);
          setIsUploading(false);
        }, 
        async () => {
          try {
            const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
            setImageUrl(downloadURL);
            setIsUploading(false);
            setUploadProgress(100);
          } catch (err: any) {
            console.error("Error getting download URL:", err);
            alert('Erro ao obter link da imagem: ' + err.message);
            setIsUploading(false);
          }
        }
      );
    } catch (err: any) {
      console.error("Error starting chat upload task:", err);
      alert('Erro ao iniciar upload: ' + err.message);
      setIsUploading(false);
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
                    {msg.imageUrl && (
                      <div className="mb-2 rounded-lg overflow-hidden border border-white/10 bg-black/20">
                        <img 
                          src={msg.imageUrl} 
                          alt="Imagem" 
                          className="w-full h-auto max-h-[300px] object-contain"
                          referrerPolicy="no-referrer"
                        />
                      </div>
                    )}
                    {msg.text && <p className="text-sm">{msg.text}</p>}
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
        {imageUrl && (
          <div className="mb-3 relative inline-block">
            <div className="w-20 h-20 rounded-xl overflow-hidden border border-zinc-700 bg-black">
              <img src={imageUrl} alt="Preview" className="w-full h-full object-cover" />
            </div>
            <button
              onClick={() => setImageUrl('')}
              className="absolute -top-2 -right-2 bg-zinc-800 text-white p-1 rounded-full border border-zinc-700 hover:bg-red-500 transition-colors"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        )}
        <form onSubmit={handleSendMessage} className="flex items-center space-x-2">
          <input 
            type="file" 
            ref={fileInputRef}
            onChange={handleFileUpload}
            accept="image/*"
            className="hidden"
          />
          <button
            type="button"
            onClick={() => {
              if (isPremiumActive(currentUserProfile)) {
                fileInputRef.current?.click();
              } else {
                setShowPremiumModal(true);
              }
            }}
            disabled={isUploading}
            className={`p-2.5 rounded-full transition-colors shrink-0 ${isPremiumActive(currentUserProfile) ? 'text-pink-500 hover:bg-pink-500/10' : 'text-zinc-600 hover:text-yellow-500'}`}
            title={isPremiumActive(currentUserProfile) ? "Enviar Foto" : "Torne-se Premium para enviar fotos"}
          >
            {isUploading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : isPremiumActive(currentUserProfile) ? (
              <Camera className="w-5 h-5" />
            ) : (
              <Crown className="w-5 h-5" />
            )}
          </button>
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
            disabled={(!newMessage.trim() && !imageUrl) || isExpired || isUploading}
            className="p-2.5 rounded-full bg-pink-600 text-white disabled:opacity-50 disabled:cursor-not-allowed hover:bg-pink-500 transition-colors shrink-0"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
      {showPremiumModal && <PremiumModal onClose={() => setShowPremiumModal(false)} />}
    </div>
  );
}
