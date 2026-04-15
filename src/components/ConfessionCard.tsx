import { useState, useEffect, memo, useRef, lazy, Suspense } from 'react';
import { Confession, UserProfile, REPORT_REASONS } from '../types';
import { Heart, MessageCircle, Share2, User, Trash2, AlertTriangle, Flag, ShieldCheck, Flame, Download, Crown } from 'lucide-react';
import { toPng } from 'html-to-image';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '../lib/utils';
import { doc, updateDoc, increment, setDoc, deleteDoc, getDoc, writeBatch, collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType } from '../firebase';
import { motion, AnimatePresence } from 'motion/react';
import { getUserProfile, isPremiumActive } from '../lib/userCache';

// Lazy loaded components
const CommentSection = lazy(() => import('./CommentSection'));
const UserProfileModal = lazy(() => import('./UserProfileModal'));
const ShareModal = lazy(() => import('./ShareModal'));

interface ConfessionCardProps {
  confession: Confession;
}

const ConfessionCard = memo(function ConfessionCard({ confession }: ConfessionCardProps) {
  const [isLiked, setIsLiked] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [likeLoading, setLikeLoading] = useState(false);
  const [authorProfile, setAuthorProfile] = useState<UserProfile | null>(null);
  const [authorNickname, setAuthorNickname] = useState<string>('Carregando...');
  const [authorAvatar, setAuthorAvatar] = useState<string | null>(null);
  const [showProfile, setShowProfile] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isReporting, setIsReporting] = useState(false);
  const [hasReported, setHasReported] = useState(false);
  const [userJudgement, setUserJudgement] = useState<'right' | 'wrong' | null>(null);
  const [judgementLoading, setJudgementLoading] = useState(false);
  const [currentUserProfile, setCurrentUserProfile] = useState<UserProfile | null>(null);
  const [isCopied, setIsCopied] = useState(false);

  useEffect(() => {
    const checkInteractions = async () => {
      if (!auth.currentUser) return;
      
      // Check like
      const likeRef = doc(db, 'confessions', confession.id, 'likes', auth.currentUser.uid);
      const likeSnap = await getDoc(likeRef);
      setIsLiked(likeSnap.exists());

      // Check judgement
      const judgementRef = doc(db, 'confessions', confession.id, 'judgements', auth.currentUser.uid);
      const judgementSnap = await getDoc(judgementRef);
      if (judgementSnap.exists()) {
        setUserJudgement(judgementSnap.data().vote);
      }
      
      // Get current user profile for admin check
      const profile = await getUserProfile(auth.currentUser.uid);
      setCurrentUserProfile(profile);
    };
    checkInteractions();
  }, [confession.id]);

  useEffect(() => {
    const fetchAuthor = async () => {
      try {
        const userProfile = await getUserProfile(confession.authorId);
        if (userProfile) {
          setAuthorProfile(userProfile);
          setAuthorNickname(userProfile.nickname);
          setAuthorAvatar(userProfile.avatar || null);
        } else {
          setAuthorNickname('Usuário Anônimo');
        }
      } catch (error) {
        console.error("Error fetching author:", error);
        setAuthorNickname('Usuário');
      }
    };
    fetchAuthor();

    const handleProfileUpdate = (e: any) => {
      const { userId, profile: updatedProfile } = e.detail;
      if (userId === confession.authorId) {
        setAuthorProfile(prev => prev ? { ...prev, ...updatedProfile } : updatedProfile);
        if (updatedProfile.nickname) setAuthorNickname(updatedProfile.nickname);
        if (updatedProfile.avatar) setAuthorAvatar(updatedProfile.avatar);
      }
      if (auth.currentUser && userId === auth.currentUser.uid) {
        setCurrentUserProfile(prev => prev ? { ...prev, ...updatedProfile } : updatedProfile);
      }
    };

    window.addEventListener('userProfileUpdated', handleProfileUpdate);
    return () => window.removeEventListener('userProfileUpdated', handleProfileUpdate);
  }, [confession.authorId]);

  const handleLike = async () => {
    if (!auth.currentUser || likeLoading) return;
    setLikeLoading(true);
    
    const likeRef = doc(db, 'confessions', confession.id, 'likes', auth.currentUser.uid);
    const confessionRef = doc(db, 'confessions', confession.id);

    try {
      const batch = writeBatch(db);
      if (isLiked) {
        batch.delete(likeRef);
        batch.update(confessionRef, { likes: increment(-1) });
        setIsLiked(false);
        await batch.commit();
      } else {
        batch.set(likeRef, { createdAt: serverTimestamp() });
        batch.update(confessionRef, { likes: increment(1) });
        setIsLiked(true);
        await batch.commit();
      }
    } catch (error) {
      console.error("Error toggling like:", error);
      setIsLiked(!isLiked); // Revert on error
    } finally {
      setLikeLoading(false);
    }
  };

  const handleJudgement = async (vote: 'right' | 'wrong') => {
    if (!auth.currentUser || judgementLoading) return;
    if (userJudgement === vote) return; // Already voted this
    
    setJudgementLoading(true);
    const judgementRef = doc(db, 'confessions', confession.id, 'judgements', auth.currentUser.uid);
    const confessionRef = doc(db, 'confessions', confession.id);

    try {
      const batch = writeBatch(db);
      
      // If changing vote
      if (userJudgement) {
        batch.update(confessionRef, { 
          [`judgement.${userJudgement}`]: increment(-1),
          [`judgement.${vote}`]: increment(1)
        });
      } else {
        // New vote
        batch.update(confessionRef, { 
          [`judgement.${vote}`]: increment(1)
        });
      }
      
      batch.set(judgementRef, { vote, createdAt: serverTimestamp() });
      await batch.commit();
      setUserJudgement(vote);
    } catch (error) {
      console.error("Error voting:", error);
      setUserJudgement(userJudgement); // Revert or handle error
    } finally {
      setJudgementLoading(false);
    }
  };

  const cardRef = useRef<HTMLDivElement>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);

  const handleExportImage = () => {
    setShowShareModal(true);
  };

  const handleShare = async () => {
    const shareText = `Confissão de ${authorNickname}: "${confession.text}"\n\nLeia mais no app!`;
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Confissão Anônima',
          text: shareText,
          url: window.location.href,
        });
      } catch (err) {
        console.error('Error sharing:', err);
      }
    } else {
      navigator.clipboard.writeText(shareText);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    }
  };

  const isAdmin = currentUserProfile?.role === 'admin' || auth.currentUser?.email === 'wiillsantos16@gmail.com';
  const isOwner = auth.currentUser?.uid === confession.authorId;
  const canDelete = isOwner || isAdmin;

  const handleDelete = async () => {
    if (!auth.currentUser || !canDelete) return;
    setIsDeleting(true);
    try {
      await deleteDoc(doc(db, 'confessions', confession.id));
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `confessions/${confession.id}`);
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  const [showReportModal, setShowReportModal] = useState(false);
  const [reportReason, setReportReason] = useState('');

  const handleReport = async () => {
    if (!auth.currentUser || hasReported || isReporting || !reportReason) return;
    setIsReporting(true);
    try {
      await addDoc(collection(db, 'reports'), {
        confessionId: confession.id,
        reportedBy: auth.currentUser.uid,
        reason: reportReason,
        createdAt: serverTimestamp(),
        status: 'pending'
      });
      setHasReported(true);
      setShowReportModal(false);
      const btn = document.getElementById(`report-btn-${confession.id}`);
      if (btn) {
        btn.innerHTML = '<span class="text-xs text-red-500">Denunciado</span>';
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'reports');
    } finally {
      setIsReporting(false);
    }
  };

  return (
    <motion.div 
      ref={cardRef}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "border rounded-2xl p-5 mb-4 shadow-xl relative overflow-hidden",
        confession.background ? confession.background : "bg-zinc-900",
        authorProfile?.role === 'admin' ? "border-pink-500/50 shadow-pink-500/10" : "border-zinc-800"
      )}
    >
      {confession.background && (
        <div className="absolute inset-0 bg-black/20 pointer-events-none" />
      )}
      <div className="relative z-10">
        <div className="flex items-center justify-between mb-4">
        <button 
          onClick={() => setShowProfile(true)}
          className="flex items-center space-x-3 hover:opacity-80 transition-opacity text-left"
        >
          <div className="w-10 h-10 bg-pink-600/20 rounded-full flex items-center justify-center text-pink-500 shrink-0 overflow-hidden">
            {authorAvatar ? (
              <img src={authorAvatar} alt="Avatar" className="w-full h-full object-cover" />
            ) : (
              <User className="w-5 h-5" />
            )}
          </div>
          <div>
            <div className="flex items-center space-x-1">
              <p className={cn("text-sm font-bold flex items-center space-x-1", authorProfile?.role === 'admin' ? "text-pink-400" : "text-zinc-100")}>
                <span>{authorNickname}</span>
                {isPremiumActive(authorProfile) && (
                  <Crown className="w-3 h-3 text-yellow-500 fill-yellow-500" />
                )}
              </p>
              {authorProfile?.isVerified && (
                <ShieldCheck className="w-4 h-4 text-blue-400" />
              )}
            </div>
            <div className="flex items-center space-x-2 mt-0.5">
              <span className="text-[10px] uppercase tracking-wider font-medium text-pink-500">
                {confession.category}
              </span>
              {confession.likes >= 10 && (
                <span className="flex items-center space-x-1 bg-orange-500/10 text-orange-500 text-[10px] px-1.5 py-0.5 rounded-full font-bold uppercase tracking-wider">
                  <Flame className="w-3 h-3" />
                  <span>Em alta</span>
                </span>
              )}
              {(confession.age || confession.gender) && (
                <span className="text-[10px] text-zinc-500">
                  • {confession.age ? `${confession.age}a` : ''} {confession.gender ? `(${confession.gender})` : ''}
                </span>
              )}
            </div>
          </div>
        </button>
        <div className="flex items-center space-x-3">
          <span className="text-xs text-zinc-500 shrink-0">
            {confession.createdAt?.toDate ? formatDistanceToNow(confession.createdAt.toDate(), { addSuffix: true, locale: ptBR }) : 'agora'}
          </span>
          {canDelete && (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className={cn("transition-colors p-1", isAdmin && !isOwner ? "text-red-500 hover:text-red-400" : "text-zinc-500 hover:text-red-500")}
              title={isAdmin && !isOwner ? "Deletar como Admin" : "Deletar"}
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      <p className="text-zinc-100 text-lg leading-relaxed mb-6 font-medium">
        "{confession.text}"
      </p>

      {confession.imageUrl && (
        <div className="mb-6 rounded-xl overflow-hidden border border-zinc-800 bg-black/40">
          <img 
            src={confession.imageUrl} 
            alt="Anexo da confissão" 
            className="w-full h-auto max-h-[400px] object-contain mx-auto"
            referrerPolicy="no-referrer"
          />
        </div>
      )}

      <div className="bg-zinc-950/50 rounded-xl p-3 mb-4 border border-zinc-800/50">
        <p className="text-xs text-zinc-400 font-medium mb-2 text-center uppercase tracking-wider">Você acha isso:</p>
        <div className="flex items-center justify-center space-x-3">
          <button
            onClick={() => handleJudgement('right')}
            disabled={judgementLoading}
            className={cn(
              "flex-1 py-2 px-3 rounded-lg flex items-center justify-center space-x-2 text-sm font-medium transition-all",
              userJudgement === 'right' 
                ? "bg-green-500/20 text-green-400 border border-green-500/30" 
                : "bg-zinc-900 text-zinc-400 border border-zinc-800 hover:bg-zinc-800 hover:text-green-400"
            )}
          >
            <span>✔️ Certo</span>
            {confession.judgement?.right !== undefined && (
              <span className="bg-zinc-950 px-1.5 py-0.5 rounded text-xs opacity-80">
                {confession.judgement.right + (userJudgement === 'right' && !judgementLoading ? 0 : 0)}
              </span>
            )}
          </button>
          <button
            onClick={() => handleJudgement('wrong')}
            disabled={judgementLoading}
            className={cn(
              "flex-1 py-2 px-3 rounded-lg flex items-center justify-center space-x-2 text-sm font-medium transition-all",
              userJudgement === 'wrong' 
                ? "bg-red-500/20 text-red-400 border border-red-500/30" 
                : "bg-zinc-900 text-zinc-400 border border-zinc-800 hover:bg-zinc-800 hover:text-red-400"
            )}
          >
            <span>❌ Errado</span>
            {confession.judgement?.wrong !== undefined && (
              <span className="bg-zinc-950 px-1.5 py-0.5 rounded text-xs opacity-80">
                {confession.judgement.wrong + (userJudgement === 'wrong' && !judgementLoading ? 0 : 0)}
              </span>
            )}
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-zinc-800 pt-4">
        <div className="flex space-x-4">
          <button 
            onClick={handleLike}
            disabled={likeLoading}
            className={cn(
              "flex items-center space-x-1.5 text-sm transition-colors",
              isLiked ? "text-pink-500" : "text-zinc-400 hover:text-pink-400"
            )}
          >
            <Heart className={cn("w-5 h-5", isLiked && "fill-current")} />
            <span>{confession.likes + (isLiked && !likeLoading ? 0 : 0)}</span>
          </button>
          
          <button 
            onClick={() => setShowComments(!showComments)}
            className="flex items-center space-x-1.5 text-sm text-zinc-400 hover:text-blue-400 transition-colors"
          >
            <MessageCircle className="w-5 h-5" />
            <span>{confession.commentCount}</span>
          </button>
        </div>

        <div className="flex items-center space-x-3">
          <button 
            onClick={handleExportImage}
            disabled={isExporting}
            className="flex items-center space-x-1.5 text-sm text-zinc-400 hover:text-pink-400 transition-colors disabled:opacity-50"
            title="Exportar como Imagem"
          >
            <Download className="w-5 h-5" />
          </button>

          <button 
            onClick={handleShare}
            className="flex items-center space-x-1.5 text-sm text-zinc-400 hover:text-zinc-200 transition-colors"
            title="Compartilhar Link"
          >
            {isCopied ? (
              <span className="text-xs text-green-500 font-medium">Copiado!</span>
            ) : (
              <Share2 className="w-5 h-5" />
            )}
          </button>
          
          {!isOwner && (
            <button 
              id={`report-btn-${confession.id}`}
              onClick={() => setShowReportModal(true)}
              disabled={hasReported || isReporting}
              className="flex items-center space-x-1.5 text-sm text-zinc-400 hover:text-red-400 transition-colors disabled:opacity-50"
              title="Denunciar"
            >
              <Flag className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {showComments && (
        <div className="mt-4 pt-4 border-t border-zinc-800">
          <Suspense fallback={<div className="flex justify-center py-4"><div className="w-6 h-6 border-2 border-pink-500 border-t-transparent rounded-full animate-spin" /></div>}>
            <CommentSection 
              confessionId={confession.id} 
              confessionText={confession.text} 
              confessionAuthorId={confession.authorId}
            />
          </Suspense>
        </div>
      )}

      <AnimatePresence>
        {showProfile && (
          <Suspense fallback={null}>
            <UserProfileModal 
              userId={confession.authorId} 
              onClose={() => setShowProfile(false)} 
            />
          </Suspense>
        )}
        
        {showDeleteConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-10 bg-zinc-900/95 backdrop-blur-sm rounded-2xl flex flex-col items-center justify-center p-6 text-center"
          >
            <AlertTriangle className="w-10 h-10 text-red-500 mb-3" />
            <h3 className="text-lg font-bold text-zinc-100 mb-2">Excluir Confissão?</h3>
            <p className="text-sm text-zinc-400 mb-6">Esta ação não pode ser desfeita e todos os comentários serão perdidos.</p>
            <div className="flex items-center space-x-3 w-full max-w-xs">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                disabled={isDeleting}
                className="flex-1 py-2.5 rounded-xl font-medium text-zinc-300 bg-zinc-800 hover:bg-zinc-700 transition-colors disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleDelete}
                disabled={isDeleting}
                className="flex-1 py-2.5 rounded-xl font-medium text-white bg-red-600 hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center justify-center"
              >
                {isDeleting ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  'Excluir'
                )}
              </button>
            </div>
          </motion.div>
        )}

        {showReportModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-10 bg-zinc-900/95 backdrop-blur-sm rounded-2xl flex flex-col items-center justify-center p-6"
          >
            <Flag className="w-8 h-8 text-red-500 mb-3" />
            <h3 className="text-lg font-bold text-zinc-100 mb-4">Denunciar Confissão</h3>
            
            <div className="w-full max-w-xs space-y-2 mb-6">
              {REPORT_REASONS.map((reason) => (
                <button
                  key={reason}
                  onClick={() => setReportReason(reason)}
                  className={cn(
                    "w-full text-left px-4 py-2.5 rounded-xl text-sm font-medium transition-colors border",
                    reportReason === reason 
                      ? "bg-red-500/20 border-red-500/50 text-red-400" 
                      : "bg-zinc-800 border-zinc-700 text-zinc-300 hover:bg-zinc-700"
                  )}
                >
                  {reason}
                </button>
              ))}
            </div>

            <div className="flex items-center space-x-3 w-full max-w-xs">
              <button
                onClick={() => {
                  setShowReportModal(false);
                  setReportReason('');
                }}
                disabled={isReporting}
                className="flex-1 py-2.5 rounded-xl font-medium text-zinc-300 bg-zinc-800 hover:bg-zinc-700 transition-colors disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleReport}
                disabled={isReporting || !reportReason}
                className="flex-1 py-2.5 rounded-xl font-medium text-white bg-red-600 hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center justify-center"
              >
                {isReporting ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  'Enviar'
                )}
              </button>
            </div>
          </motion.div>
        )}

        {showShareModal && (
          <Suspense fallback={null}>
            <ShareModal
              confession={confession}
              authorNickname={authorNickname}
              authorAvatar={authorAvatar}
              authorProfile={authorProfile}
              onClose={() => setShowShareModal(false)}
            />
          </Suspense>
        )}
      </AnimatePresence>
      </div>
    </motion.div>
  );
});

export default ConfessionCard;
