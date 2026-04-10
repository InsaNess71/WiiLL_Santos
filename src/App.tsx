import { useState, useEffect, useRef, useMemo } from 'react';
import { collection, query, orderBy, onSnapshot, limit, where, getDoc, getDocs, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth, signInAnonymouslyUser, signInWithGoogle, logOut, getMessagingInstance } from './firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { getToken, onMessage } from 'firebase/messaging';
import { Confession, CATEGORIES, Chat, UserProfile, ADMIN_AVATAR } from './types';
import ConfessionCard from './components/ConfessionCard';
import CreateConfession from './components/CreateConfession';
import NicknameModal from './components/NicknameModal';
import ChatList from './components/ChatList';
import InstallPrompt from './components/InstallPrompt';
import UserProfileModal from './components/UserProfileModal';
import SplashScreen from './components/SplashScreen';
import PrivacyPolicy from './components/PrivacyPolicy';
import TermsOfUse from './components/TermsOfUse';
import { Ghost, PenSquare, Flame, Clock, Filter, LogIn, MessageSquare, LogOut, User, Search, X, Trophy, Home, Bell } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

type SortOption = 'recent' | 'popular' | 'top_week';

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
  const [showMyProfile, setShowMyProfile] = useState(false);
  const [needsNickname, setNeedsNickname] = useState(false);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [totalUnread, setTotalUnread] = useState(0);
  const [toast, setToast] = useState<{id: number, title: string, message: string} | null>(null);
  
  const prevUnreadMap = useRef<Record<string, number>>({});
  const isInitialLoad = useRef(true);
  const viewingState = useRef({ showChats: false, activeChatId: null as string | null });
  
  const [sortBy, setSortBy] = useState<SortOption>('recent');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [searchedUsers, setSearchedUsers] = useState<UserProfile[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [showSplash, setShowSplash] = useState(true);
  const [feedLimit, setFeedLimit] = useState(20);
  const [hasMore, setHasMore] = useState(true);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [showTerms, setShowTerms] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setShowSplash(false);
    }, 2000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    // Handle URL parameters for Play Store links and shortcuts
    const params = new URLSearchParams(window.location.search);
    if (params.get('privacy') === 'true') {
      setShowPrivacy(true);
    }
    if (params.get('terms') === 'true') {
      setShowTerms(true);
    }
    if (params.get('action') === 'post') {
      setShowCreate(true);
    }
    if (params.get('tab') === 'trending') {
      setSortBy('popular');
    }
  }, []);

  useEffect(() => {
    // Reset feed limit when filters change
    setFeedLimit(20);
  }, [sortBy, selectedCategory]);

  useEffect(() => {
    viewingState.current = { showChats, activeChatId };
  }, [showChats, activeChatId]);

  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchedUsers([]);
      return;
    }

    const fetchUsers = async () => {
      try {
        const q = query(collection(db, 'users'), limit(100));
        const snap = await getDocs(q);
        const users = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as UserProfile));
        const filtered = users.filter(u => u.nickname?.toLowerCase().includes(searchQuery.toLowerCase()));
        setSearchedUsers(filtered);
      } catch (err) {
        console.error("Error searching users:", err);
      }
    };
    
    const timeoutId = setTimeout(fetchUsers, 300);
    return () => clearTimeout(timeoutId);
  }, [searchQuery]);

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
      if (currentUser) {
        try {
          const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
          if (!userDoc.exists()) {
            setNeedsNickname(true);
          } else {
            // Check if user is admin but doesn't have the role set
            const userData = userDoc.data();
            if (currentUser.email === 'wiillsantos16@gmail.com' && currentUser.emailVerified) {
              if (userData.role !== 'admin' || !userData.isVerified || userData.avatar !== ADMIN_AVATAR) {
                await updateDoc(doc(db, 'users', currentUser.uid), {
                  role: 'admin',
                  isVerified: true,
                  avatar: ADMIN_AVATAR
                });
              }
            }
          }

          // Request FCM Token for Push Notifications
          if ('Notification' in window) {
            try {
              const messaging = await getMessagingInstance();
              if (messaging) {
                const permission = await Notification.requestPermission();
                if (permission === 'granted') {
                  const token = await getToken(messaging, {
                    vapidKey: 'BLwRpDenfvtAIFYVYCRAYM7tSZvpmnqqHmXl3qfeoaNadCo-LKgn33vHq0qJg7QHxBUc4zRKosfV_R8fD1k83lU' 
                  });
                  
                  if (token) {
                    await updateDoc(doc(db, 'users', currentUser.uid), {
                      fcmToken: token
                    });
                  }
                }
              }
            } catch (err) {
              console.error("Erro ao obter token FCM:", err);
            }
          }

        } catch (error) {
          console.error("Error checking user profile:", error);
        }
      }
      setUser(currentUser);
      setIsAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  // Listen for foreground messages
  useEffect(() => {
    let unsubscribe: any;
    
    const setupMessaging = async () => {
      try {
        const messaging = await getMessagingInstance();
        if (!messaging) return;
        
        unsubscribe = onMessage(messaging, (payload) => {
          setToast({ 
            id: Date.now(), 
            title: payload.notification?.title || 'Nova Notificação', 
            message: payload.notification?.body || 'Você tem uma nova mensagem.' 
          });
          playNotificationSound();
        });
      } catch (err) {
        console.error("Erro ao configurar listener de mensagens:", err);
      }
    };

    setupMessaging();

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!user || needsNickname) return;

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
  }, [user, needsNickname]);

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
        limit(feedLimit)
      );
    } else if (sortBy === 'popular' || sortBy === 'top_week') {
      finalQuery = query(
        collection(db, 'confessions'), 
        orderBy('likes', 'desc'), 
        limit(feedLimit)
      );
    } else {
      finalQuery = query(
        collection(db, 'confessions'), 
        orderBy('createdAt', 'desc'), 
        limit(feedLimit)
      );
    }

    const unsubscribe = onSnapshot(finalQuery, (snapshot) => {
      let data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Confession[];

      // Check if we have more items to load
      setHasMore(snapshot.docs.length === feedLimit);

      // If category is selected, we need to sort in JS since we couldn't use orderBy in the query
      if (selectedCategory) {
        data.sort((a, b) => {
          if (sortBy === 'popular' || sortBy === 'top_week') {
            return (b.likes || 0) - (a.likes || 0);
          } else {
            const timeA = a.createdAt?.toDate?.()?.getTime() || 0;
            const timeB = b.createdAt?.toDate?.()?.getTime() || 0;
            return timeB - timeA;
          }
        });
      }

      // Filter for top_week
      if (sortBy === 'top_week') {
        const oneWeekAgo = new Date();
        oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
        data = data.filter(c => {
          const createdAt = c.createdAt?.toDate?.();
          return createdAt && createdAt >= oneWeekAgo;
        });
      }

      setConfessions(data);
    });

    return () => unsubscribe();
  }, [isAuthReady, sortBy, selectedCategory]);

  const filteredConfessions = useMemo(() => {
    if (!searchQuery.trim()) return confessions;
    const lowerQuery = searchQuery.toLowerCase();
    return confessions.filter(c => c.text.toLowerCase().includes(lowerQuery));
  }, [confessions, searchQuery]);

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
      <AnimatePresence>
        {showSplash && <SplashScreen />}
      </AnimatePresence>

      {/* Header */}
      <header className="sticky top-0 z-40 bg-zinc-950/80 backdrop-blur-md border-b border-zinc-800">
        <div className="max-w-3xl mx-auto px-4 h-16 flex items-center justify-between relative">
          {showSearch ? (
            <motion.div 
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center w-full space-x-2"
            >
              <Search className="w-5 h-5 text-zinc-400 shrink-0" />
              <input
                autoFocus
                type="text"
                placeholder="Pesquisar pessoas ou confissões..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="flex-1 bg-transparent border-none text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-0 text-sm sm:text-base"
              />
              <button 
                onClick={() => { setShowSearch(false); setSearchQuery(''); }} 
                className="p-2 text-zinc-400 hover:text-zinc-200 transition-colors shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </motion.div>
          ) : (
            <>
              <div className="flex items-center justify-center sm:justify-start w-full sm:w-auto space-x-2">
                <Ghost className="w-6 h-6 text-pink-500" />
                <h1 className="text-xl font-bold tracking-tight">Confissões<span className="text-pink-500">.</span></h1>
              </div>
              
              {!user ? (
                <div className="hidden sm:flex items-center space-x-3">
                  <button 
                    onClick={() => setShowSearch(true)}
                    className="p-2 rounded-full bg-zinc-900 text-zinc-400 hover:text-zinc-200 border border-zinc-800 transition-colors"
                    title="Pesquisar"
                  >
                    <Search className="w-5 h-5" />
                  </button>
                  <button 
                    onClick={signInWithGoogle}
                    className="flex items-center space-x-2 bg-white text-zinc-900 hover:bg-zinc-200 px-4 py-2 rounded-full text-sm font-medium transition-colors shadow-lg"
                    title="Salva seu perfil para não perder ao sair (Seu email ficará oculto)"
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24">
                      <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                    </svg>
                    <span className="hidden sm:inline">Entrar com Google</span>
                  </button>
                  <button 
                    onClick={signInAnonymouslyUser}
                    className="flex items-center space-x-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 px-4 py-2 rounded-full text-sm font-medium transition-colors border border-zinc-700"
                    title="Conta temporária (Você perde se deslogar)"
                  >
                    <Ghost className="w-4 h-4" />
                    <span className="hidden sm:inline">Entrar como Visitante</span>
                  </button>
                </div>
              ) : (
                <div className="hidden sm:flex items-center space-x-3">
                  <button 
                    onClick={() => setShowSearch(true)}
                    className="p-2 rounded-full bg-zinc-900 text-zinc-400 hover:text-zinc-200 border border-zinc-800 transition-colors"
                    title="Pesquisar"
                  >
                    <Search className="w-5 h-5" />
                  </button>
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
                    onClick={() => setShowMyProfile(true)}
                    className="p-2 rounded-full bg-zinc-900 text-zinc-400 hover:text-pink-400 border border-zinc-800 transition-colors"
                    title="Meu Perfil"
                  >
                    <User className="w-5 h-5" />
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
            </>
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
                <div className="flex space-x-2 bg-zinc-900 p-1 rounded-lg border border-zinc-800 shrink-0 overflow-x-auto custom-scrollbar">
                  <button
                    onClick={() => setSortBy('recent')}
                    className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors whitespace-nowrap ${sortBy === 'recent' ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-400 hover:text-zinc-200'}`}
                  >
                    <Clock className="w-4 h-4" />
                    <span>Recentes</span>
                  </button>
                  <button
                    onClick={() => setSortBy('popular')}
                    className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors whitespace-nowrap ${sortBy === 'popular' ? 'bg-zinc-800 text-pink-400' : 'text-zinc-400 hover:text-pink-400'}`}
                  >
                    <Flame className="w-4 h-4" />
                    <span>Em Alta</span>
                  </button>
                  <button
                    onClick={() => setSortBy('top_week')}
                    className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors whitespace-nowrap ${sortBy === 'top_week' ? 'bg-zinc-800 text-yellow-400' : 'text-zinc-400 hover:text-yellow-400'}`}
                  >
                    <Trophy className="w-4 h-4" />
                    <span>Top Semana</span>
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
              {searchQuery.trim() && searchedUsers.length > 0 && (
                <div className="mb-6">
                  <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-wider mb-3">Pessoas ({searchedUsers.length})</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {searchedUsers.map(u => (
                      <button
                        key={u.id}
                        onClick={() => setSelectedUserId(u.id)}
                        className="flex items-center space-x-3 bg-zinc-900 border border-zinc-800 p-3 rounded-xl hover:bg-zinc-800 transition-colors text-left"
                      >
                        <div className="w-10 h-10 bg-pink-600/20 rounded-full flex items-center justify-center text-pink-500 shrink-0 overflow-hidden">
                          {u.avatar ? (
                            <img src={u.avatar} alt="Avatar" className="w-full h-full object-cover" />
                          ) : (
                            <User className="w-5 h-5" />
                          )}
                        </div>
                        <div className="flex-1 overflow-hidden">
                          <p className="text-sm font-bold text-zinc-100 truncate">{u.nickname}</p>
                          <p className="text-xs text-zinc-500 truncate">{u.bio || 'Sem bio'}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {searchQuery.trim() && <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-wider mb-3">Confissões</h3>}

              {filteredConfessions.length === 0 ? (
                <div className="text-center py-20">
                  <Ghost className="w-12 h-12 text-zinc-800 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-zinc-400">Nenhuma confissão encontrada</h3>
                  <p className="text-zinc-500 mt-1">Tente pesquisar com outras palavras.</p>
                </div>
              ) : (
                <>
                  {filteredConfessions.map(confession => (
                      <ConfessionCard key={confession.id} confession={confession} />
                    ))}
                  
                  {hasMore && !searchQuery.trim() && (
                    <div className="pt-4 pb-8 flex justify-center">
                      <button
                        onClick={() => setFeedLimit(prev => prev + 20)}
                        className="px-6 py-2.5 bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-zinc-300 rounded-full text-sm font-medium transition-colors"
                      >
                        Carregar mais
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          </>
        )}
      </main>

      <AnimatePresence>
        {showCreate && <CreateConfession onClose={() => setShowCreate(false)} />}
        {needsNickname && <NicknameModal onComplete={() => setNeedsNickname(false)} />}
        {showMyProfile && user && <UserProfileModal userId={user.uid} onClose={() => setShowMyProfile(false)} />}
        {selectedUserId && <UserProfileModal userId={selectedUserId} onClose={() => setSelectedUserId(null)} />}
        {showPrivacy && <PrivacyPolicy onClose={() => setShowPrivacy(false)} />}
        {showTerms && <TermsOfUse onClose={() => setShowTerms(false)} />}
        
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
      
      {/* Bottom Menu for Mobile */}
      {user && (
        <div className="fixed bottom-0 left-0 right-0 z-40 bg-zinc-950/90 backdrop-blur-lg border-t border-zinc-800 sm:hidden pb-safe">
          <div className="flex items-center justify-around p-3">
            <button 
              onClick={() => { setShowChats(false); setShowMyProfile(false); }}
              className={`flex flex-col items-center space-y-1 ${!showChats && !showMyProfile ? 'text-pink-500' : 'text-zinc-500 hover:text-zinc-300'}`}
            >
              <Home className="w-6 h-6" />
              <span className="text-[10px] font-medium">Feed</span>
            </button>
            <button 
              onClick={() => setShowSearch(true)}
              className="flex flex-col items-center space-y-1 text-zinc-500 hover:text-zinc-300"
            >
              <Search className="w-6 h-6" />
              <span className="text-[10px] font-medium">Buscar</span>
            </button>
            <button 
              onClick={() => setShowCreate(true)}
              className="flex flex-col items-center space-y-1 text-zinc-500 hover:text-zinc-300 relative -top-4"
            >
              <div className="bg-pink-600 text-white p-3 rounded-full shadow-lg shadow-pink-500/30">
                <PenSquare className="w-6 h-6" />
              </div>
            </button>
            <button 
              onClick={handleChatClick}
              className={`flex flex-col items-center space-y-1 relative ${showChats ? 'text-pink-500' : 'text-zinc-500 hover:text-zinc-300'}`}
            >
              <div className="relative">
                <Bell className="w-6 h-6" />
                {totalUnread > 0 && (
                  <span className="absolute -top-1 -right-1 bg-pink-500 text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center shadow-sm">
                    {totalUnread > 99 ? '99+' : totalUnread}
                  </span>
                )}
              </div>
              <span className="text-[10px] font-medium">Alertas</span>
            </button>
            <button 
              onClick={() => setShowMyProfile(true)}
              className={`flex flex-col items-center space-y-1 ${showMyProfile ? 'text-pink-500' : 'text-zinc-500 hover:text-zinc-300'}`}
            >
              <User className="w-6 h-6" />
              <span className="text-[10px] font-medium">Perfil</span>
            </button>
          </div>
        </div>
      )}

      {/* Add padding to bottom of main content on mobile to account for bottom menu */}
      <style dangerouslySetInnerHTML={{__html: `
        @media (max-width: 640px) {
          main {
            padding-bottom: 5rem !important;
          }
        }
      `}} />

      <InstallPrompt />
    </div>
  );
}
