import { useState, useEffect } from 'react';
import { Confession } from '../types';
import { Heart, MessageCircle, Share2, User, Trash2, AlertTriangle, Flag } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '../lib/utils';
import { doc, updateDoc, increment, setDoc, deleteDoc, getDoc, writeBatch, collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { motion, AnimatePresence } from 'motion/react';
import CommentSection from './CommentSection';
import UserProfileModal from './UserProfileModal';

interface ConfessionCardProps {
  confession: Confession;
}

export default function ConfessionCard({ confession }: ConfessionCardProps) {
  const [isLiked, setIsLiked] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [likeLoading, setLikeLoading] = useState(false);
  const [authorNickname, setAuthorNickname] = useState<string>('Carregando...');
  const [authorAvatar, setAuthorAvatar] = useState<string | null>(null);
  const [showProfile, setShowProfile] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isReporting, setIsReporting] = useState(false);
  const [hasReported, setHasReported] = useState(false);

  useEffect(() => {
    const checkLike = async () => {
      if (!auth.currentUser) return;
      const likeRef = doc(db, 'confessions', confession.id, 'likes', auth.currentUser.uid);
      const likeSnap = await getDoc(likeRef);
      setIsLiked(likeSnap.exists());
    };
    checkLike();
  }, [confession.id]);

  useEffect(() => {
    const fetchAuthor = async () => {
      try {
        const userDoc = await getDoc(doc(db, 'users', confession.authorId));
        if (userDoc.exists()) {
          setAuthorNickname(userDoc.data().nickname);
          setAuthorAvatar(userDoc.data().avatar || null);
        } else {
          setAuthorNickname('Usuário Anônimo');
        }
      } catch (error) {
        console.error("Error fetching author:", error);
        setAuthorNickname('Usuário');
      }
    };
    fetchAuthor();
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
        await batch.commit();
        setIsLiked(false);
      } else {
        batch.set(likeRef, { createdAt: new Date() });
        batch.update(confessionRef, { likes: increment(1) });
        await batch.commit();
        setIsLiked(true);
      }
    } catch (error) {
      console.error("Error toggling like:", error);
    } finally {
      setLikeLoading(false);
    }
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
      // Fallback for clipboard copy feedback (since alert is discouraged)
      const btn = document.getElementById(`share-btn-${confession.id}`);
      if (btn) {
        const originalText = btn.innerHTML;
        btn.innerHTML = '<span class="text-xs text-green-500">Copiado!</span>';
        setTimeout(() => { btn.innerHTML = originalText; }, 2000);
      }
    }
  };

  const handleDelete = async () => {
    if (!auth.currentUser || auth.currentUser.uid !== confession.authorId) return;
    setIsDeleting(true);
    try {
      await deleteDoc(doc(db, 'confessions', confession.id));
    } catch (error) {
      console.error("Error deleting confession:", error);
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  const handleReport = async () => {
    if (!auth.currentUser || hasReported || isReporting) return;
    setIsReporting(true);
    try {
      await addDoc(collection(db, 'reports'), {
        confessionId: confession.id,
        reportedBy: auth.currentUser.uid,
        createdAt: serverTimestamp(),
        status: 'pending'
      });
      setHasReported(true);
      const btn = document.getElementById(`report-btn-${confession.id}`);
      if (btn) {
        btn.innerHTML = '<span class="text-xs text-red-500">Denunciado</span>';
      }
    } catch (error) {
      console.error("Error reporting:", error);
    } finally {
      setIsReporting(false);
    }
  };

  const isOwner = auth.currentUser?.uid === confession.authorId;

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 mb-4 shadow-xl relative"
    >
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
            <p className="text-sm font-bold text-zinc-100">{authorNickname}</p>
            <div className="flex items-center space-x-2 mt-0.5">
              <span className="text-[10px] uppercase tracking-wider font-medium text-pink-500">
                {confession.category}
              </span>
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
          {isOwner && (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="text-zinc-500 hover:text-red-500 transition-colors p-1"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      <p className="text-zinc-100 text-lg leading-relaxed mb-6 font-medium">
        "{confession.text}"
      </p>

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
            id={`share-btn-${confession.id}`}
            onClick={handleShare}
            className="flex items-center space-x-1.5 text-sm text-zinc-400 hover:text-zinc-200 transition-colors"
            title="Compartilhar"
          >
            <Share2 className="w-5 h-5" />
          </button>
          
          {!isOwner && (
            <button 
              id={`report-btn-${confession.id}`}
              onClick={handleReport}
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
          <CommentSection confessionId={confession.id} />
        </div>
      )}

      <AnimatePresence>
        {showProfile && (
          <UserProfileModal 
            userId={confession.authorId} 
            onClose={() => setShowProfile(false)} 
          />
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
      </AnimatePresence>
    </motion.div>
  );
}
