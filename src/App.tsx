import { useState, useEffect, useRef } from 'react';
import { collection, query, orderBy, onSnapshot, limit, where, getDoc, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth, signInWithGoogle, logOut } from './firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { Confession, CATEGORIES, Chat } from './types';
import ConfessionCard from './components/ConfessionCard';
import CreateConfession from './components/CreateConfession';
import NicknameModal from './components/NicknameModal';
import ChatList from './components/ChatList';
import InstallPrompt from './components/InstallPrompt';
import { Ghost, PenSquare, Flame, Clock, Filter, LogIn, MessageSquare, LogOut } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

type SortOption = 'recent' | 'popular';

let audioCtx: AudioContext | null = null;

const initAudio = () => {
  try {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
  } catch (e) {
    console.error("Audio init failed", e);
  }
};

if (typeof document !== 'undefined') {
  const init = () => {
    initAudio();
    document.removeEventListener('pointerdown', init);
    document.removeEventListener('keydown', init);
  };
  document.addEventListener('pointerdown', init);
  document.addEventListener('keydown', init);
}

const playNotificationSound = () => {
  try {
    initAudio();
    if (!audioCtx) return;
    
    const playBeep = (freq: number, time: number, duration: number) => {
      if (!audioCtx) return;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, time);
      gain.gain.setValueAtTime(0.1, time);
      gain.gain.exponentialRampToValueAtTime(0.00001, time + duration);
      osc.start(time);
      osc.stop(time + duration);
    };
    playBeep(880, audioCtx.currentTime, 0.1);
    playBeep(1108, audioCtx.currentTime + 0.1, 0.2);
  } catch (e) {
    console.error("Audio playback failed", e);
  }
};

export default function App() {
  const [confessions, setConfessions] = useState<Confession[]>([]);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showChats, setShowChats] = useState(false);
  const [needsNickname, setNeedsNickname] = useState(false);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [totalUnread, setTotalUnread] = useState(0);
  const [toast, setToast] = useState<{id: number, title: string, message: string} | null>(null);
  
  const prevUnreadMap = useRef<Record<string, number>>({});
  const isInitialLoad = useRef(true);
  const viewingState = useRef({ showChats: false, activeChatId: null as string | null });
  
  const [sortBy, setSortBy] = useState<SortOption>('recent');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  useEffect(() => {
    viewingState.current = { showChats, activeChatId };
  }, [showChats, activeChatId]);

  const handleChatClick = () => {
    setShowChats(!showChats);
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  };

  useEffect(() => {
    const handleOpenChat = (e: any) => {
      setActiveChatId(e.detail.chatId);
      setShowChats(true);
    };
    window.addEventListener('openChat', handleOpenChat);
    return () => window.removeEventListener('openChat', handleOpenChat);
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
        if (!userDoc.exists()) {
          setNeedsNickname(true);
        }
      }
      setIsAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;

    const updatePresence = async () => {
      try {
        await updateDoc(doc(db, 'users', user.uid), {
          lastActive: serverTimestamp()
        });
      } catch (error) {
        console.error("Error updating presence:", error);
      }
    };

    updatePresence();
    const interval = setInterval(updatePresence, 60000);

    return () => clearInterval(interval);
  }, [user]);

  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, 'chats'),
      where('participants', 'array-contains', user.uid)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      let total = 0;
      let shouldNotify = false;
      let notifyMessage = '';
      const now = new Date();
      const newUnreadMap: Record<string, number> = {};
      
      snapshot.docs.forEach(docSnap => {
        const chat = docSnap.data() as Chat;
        const chatId = docSnap.id;

        if (!chat.expiresAt?.toDate || chat.expiresAt.toDate() > now) {
          const unread = chat.unreadCount?.[user.uid] || 0;
          newUnreadMap[chatId] = unread;
          total += unread;

          const prevUnread = prevUnreadMap.current[chatId] || 0;
          if (unread > prevUnread) {
            const isViewingThisChat = viewingState.current.showChats && viewingState.current.activeChatId === chatId;
            if (!isViewingThisChat) {
              shouldNotify = true;
              notifyMessage = chat.lastMessage || 'Você recebeu uma nova mensagem';
            }
          }
        }
      });

      if (!isInitialLoad.current && shouldNotify) {
        playNotificationSound();
        setToast({ id: Date.now(), title: 'Nova mensagem', message: notifyMessage });
        setTimeout(() => setToast(null), 4000);

        if ('Notification' in window && Notification.permission === 'granted') {
          new Notification('Nova mensagem', {
            body: notifyMessage,
            icon: '/icon.svg'
          });
        }
      }
      
      isInitialLoad.current = false;
      prevUnreadMap.current = newUnreadMap;
      setTotalUnread(total);
    });

    return () => unsubscribe();
  }, [user]);

  useEffect(() => {
    if (!isAuthReady) return;

    let finalQuery;

    // Avoid composite index requirements by separating where and orderBy
    if (selectedCategory) {
      finalQuery = query(
        collection(db, 'confessions'), 
        where('category', '==', selectedCategory), 
        limit(100)
      );
    } else if (sortBy === 'popular') {
      finalQuery = query(
        collection(db, 'confessions'), 
        orderBy('likes', 'desc'), 
        limit(50)
      );
    } else {
      finalQuery = query(
        collection(db, 'confessions'), 
        orderBy('createdAt', 'desc'), 
        limit(50)
      );
    }

    const unsubscribe = onSnapshot(finalQuery, (snapshot) => {
      let data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Confession[];

      // If category is selected, we need to sort in JS since we couldn't use orderBy in the query
      if (selectedCategory) {
        data.sort((a, b) => {
          if (sortBy === 'popular') {
            return (b.likes || 0) - (a.likes || 0);
          } else {
            const timeA = a.createdAt?.toDate?.()?.getTime() || 0;
            const timeB = b.createdAt?.toDate?.()?.getTime() || 0;
            return timeB - timeA;
          }
        });
      }

      setConfessions(data);
    });

    return () => unsubscribe();
  }, [isAuthReady, sortBy, selectedCategory]);

  if (!isAuthReady) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="animate-pulse flex flex-col items-center">
          <Ghost className="w-12 h-12 text-pink-500 mb-4" />
          <p className="text-zinc-400 font-medium">Carregando segredos...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans selection:bg-pink-500/30">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-zinc-950/80 backdrop-blur-md border-b border-zinc-800">
        <div className="max-w-3xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Ghost className="w-6 h-6 text-pink-500" />
            <h1 className="text-xl font-bold tracking-tight">Confissões<span className="text-pink-500">.</span></h1>
          </div>
          
          {!user ? (
            <button 
              onClick={signInWithGoogle}
              className="flex items-center space-x-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 px-4 py-2 rounded-full text-sm font-medium transition-colors"
            >
              <LogIn className="w-4 h-4" />
              <span>Entrar para postar</span>
            </button>
          ) : (
            <div className="flex items-center space-x-3">
              <button 
                onClick={handleChatClick}
                className={`relative p-2 rounded-full transition-colors ${showChats ? 'bg-pink-600 text-white' : 'bg-zinc-900 text-zinc-400 hover:text-zinc-200 border border-zinc-800'}`}
              >
                <MessageSquare className="w-5 h-5" />
                {totalUnread > 0 && (
                  <span className="absolute -top-1 -right-1 bg-pink-500 text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center shadow-sm">
                    {totalUnread > 99 ? '99+' : totalUnread}
                  </span>
                )}
              </button>
              <button 
                onClick={() => setShowCreate(true)}
                className="flex items-center space-x-2 bg-pink-600 hover:bg-pink-500 text-white px-4 py-2 rounded-full text-sm font-medium transition-colors shadow-lg shadow-pink-500/20"
              >
                <PenSquare className="w-4 h-4" />
                <span className="hidden sm:inline">Nova Confissão</span>
              </button>
              <button 
                onClick={logOut}
                className="p-2 rounded-full bg-zinc-900 text-zinc-400 hover:text-red-400 border border-zinc-800 transition-colors"
                title="Sair da conta"
              >
                <LogOut className="w-5 h-5" />
              </button>
            </div>
          )}
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8">
        {showChats ? (
          <ChatList activeChatId={activeChatId} setActiveChatId={setActiveChatId} />
        ) : (
          <>
            {/* Filters & Categories */}
            <div className="mb-8 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex space-x-2 bg-zinc-900 p-1 rounded-lg border border-zinc-800">
                  <button
                    onClick={() => setSortBy('recent')}
                    className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${sortBy === 'recent' ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-400 hover:text-zinc-200'}`}
                  >
                    <Clock className="w-4 h-4" />
                    <span>Recentes</span>
                  </button>
                  <button
                    onClick={() => setSortBy('popular')}
                    className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${sortBy === 'popular' ? 'bg-zinc-800 text-pink-400' : 'text-zinc-400 hover:text-pink-400'}`}
                  >
                    <Flame className="w-4 h-4" />
                    <span>Em Alta</span>
                  </button>
                </div>
              </div>

              <div className="flex items-center space-x-2 overflow-x-auto pb-2 custom-scrollbar">
                <Filter className="w-4 h-4 text-zinc-500 shrink-0" />
                <button
                  onClick={() => setSelectedCategory(null)}
                  className={`shrink-0 px-3 py-1 rounded-full text-sm font-medium transition-colors ${selectedCategory === null ? 'bg-zinc-100 text-zinc-900' : 'bg-zinc-900 text-zinc-400 border border-zinc-800 hover:bg-zinc-800'}`}
                >
                  Todas
                </button>
                {CATEGORIES.map(cat => (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    className={`shrink-0 px-3 py-1 rounded-full text-sm font-medium transition-colors ${selectedCategory === cat ? 'bg-zinc-100 text-zinc-900' : 'bg-zinc-900 text-zinc-400 border border-zinc-800 hover:bg-zinc-800'}`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            {/* Feed */}
            <div className="space-y-4">
              {confessions.length === 0 ? (
                <div className="text-center py-20">
                  <Ghost className="w-12 h-12 text-zinc-800 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-zinc-400">Nenhuma confissão encontrada</h3>
                  <p className="text-zinc-500 mt-1">Seja o primeiro a compartilhar um segredo.</p>
                </div>
              ) : (
                confessions.map(confession => (
                  <ConfessionCard key={confession.id} confession={confession} />
                ))
              )}
            </div>
          </>
        )}
      </main>

      <AnimatePresence>
        {showCreate && <CreateConfession onClose={() => setShowCreate(false)} />}
        {needsNickname && <NicknameModal onComplete={() => setNeedsNickname(false)} />}
        
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -50, x: '-50%' }}
            animate={{ opacity: 1, y: 0, x: '-50%' }}
            exit={{ opacity: 0, y: -50, x: '-50%' }}
            className="fixed top-20 left-1/2 z-[100] bg-zinc-800 border border-pink-500/50 shadow-2xl rounded-xl p-4 w-[90%] max-w-sm cursor-pointer"
            onClick={() => {
              setToast(null);
              setShowChats(true);
            }}
          >
            <div className="flex items-start space-x-3">
              <div className="bg-pink-500/20 p-2 rounded-full shrink-0">
                <MessageSquare className="w-5 h-5 text-pink-500" />
              </div>
              <div className="flex-1 overflow-hidden">
                <h4 className="text-sm font-bold text-zinc-100">{toast.title}</h4>
                <p className="text-xs text-zinc-400 mt-0.5 truncate">{toast.message}</p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      
      <InstallPrompt />
    </div>
  );
}
