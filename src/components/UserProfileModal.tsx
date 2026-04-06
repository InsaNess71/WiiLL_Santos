import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { X, MessageSquare, User } from 'lucide-react';
import { db, auth } from '../firebase';
import { doc, getDoc, collection, query, where, orderBy, getDocs, setDoc, serverTimestamp } from 'firebase/firestore';
import { Confession } from '../types';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface UserProfileModalProps {
  userId: string;
  onClose: () => void;
}

export default function UserProfileModal({ userId, onClose }: UserProfileModalProps) {
  const [nickname, setNickname] = useState<string>('Carregando...');
  const [confessions, setConfessions] = useState<Confession[]>([]);
  const [loading, setLoading] = useState(true);
  const [startingChat, setStartingChat] = useState(false);

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const userDoc = await getDoc(doc(db, 'users', userId));
        if (userDoc.exists()) {
          setNickname(userDoc.data().nickname);
        } else {
          setNickname('Usuário Anônimo');
        }

        const q = query(
          collection(db, 'confessions'),
          where('authorId', '==', userId)
        );
        const snap = await getDocs(q);
        const userConfessions = snap.docs.map(d => ({ id: d.id, ...d.data() } as Confession));
        
        // Sort in JS to avoid Firestore composite index requirements
        userConfessions.sort((a, b) => {
          const timeA = a.createdAt?.toDate?.()?.getTime() || 0;
          const timeB = b.createdAt?.toDate?.()?.getTime() || 0;
          return timeB - timeA;
        });
        
        setConfessions(userConfessions);
      } catch (error) {
        console.error("Error fetching profile:", error);
        setNickname('Usuário');
      } finally {
        setLoading(false);
      }
    };
    fetchProfile();
  }, [userId]);

  const handleStartChat = async () => {
    if (!auth.currentUser || startingChat || auth.currentUser.uid === userId) return;
    setStartingChat(true);

    try {
      const uids = [auth.currentUser.uid, userId].sort();
      const chatId = `${uids[0]}_${uids[1]}`;
      
      const chatRef = doc(db, 'chats', chatId);
      const chatSnap = await getDoc(chatRef);

      if (!chatSnap.exists()) {
        const expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + 24);

        await setDoc(chatRef, {
          participants: uids,
          durationMode: '24h',
          expiresAt,
          updatedAt: serverTimestamp(),
          unreadCount: {
            [uids[0]]: 0,
            [uids[1]]: 0
          }
        });
      }
      
      window.dispatchEvent(new CustomEvent('openChat', { detail: { chatId } }));
      onClose();
    } catch (error) {
      console.error("Error starting chat:", error);
      alert('Erro ao iniciar chat.');
    } finally {
      setStartingChat(false);
    }
  };

  const isMe = auth.currentUser?.uid === userId;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl flex flex-col max-h-[85vh]"
      >
        <div className="p-6 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/50">
          <div className="flex items-center space-x-4">
            <div className="w-12 h-12 bg-pink-600/20 rounded-full flex items-center justify-center text-pink-500">
              <User className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-zinc-100">{nickname}</h2>
              <p className="text-sm text-zinc-500">{confessions.length} confissões</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 rounded-full transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto custom-scrollbar flex-1">
          {!isMe && auth.currentUser && (
            <button
              onClick={handleStartChat}
              disabled={startingChat}
              className="w-full mb-6 flex items-center justify-center space-x-2 bg-pink-600 hover:bg-pink-500 text-white py-3 px-4 rounded-xl font-medium transition-colors disabled:opacity-50"
            >
              <MessageSquare className="w-5 h-5" />
              <span>{startingChat ? 'Iniciando...' : 'Chamar no Bate-papo'}</span>
            </button>
          )}

          <h3 className="text-sm font-medium text-zinc-400 mb-4 uppercase tracking-wider">Confissões de {nickname}</h3>
          
          {loading ? (
            <div className="text-center py-8 text-zinc-500">Carregando...</div>
          ) : confessions.length === 0 ? (
            <div className="text-center py-8 text-zinc-500">Nenhuma confissão ainda.</div>
          ) : (
            <div className="space-y-4">
              {confessions.map(conf => (
                <div key={conf.id} className="bg-zinc-950 p-4 rounded-xl border border-zinc-800/50">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium text-pink-500">{conf.category}</span>
                    <span className="text-xs text-zinc-600">
                      {conf.createdAt?.toDate ? formatDistanceToNow(conf.createdAt.toDate(), { addSuffix: true, locale: ptBR }) : 'agora'}
                    </span>
                  </div>
                  <p className="text-sm text-zinc-300">"{conf.text}"</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
