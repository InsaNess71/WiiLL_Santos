import React, { useState, useEffect, memo } from 'react';
import { collection, query, where, orderBy, onSnapshot, addDoc, serverTimestamp, doc, updateDoc, increment, getDoc, writeBatch, deleteDoc } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { Comment, UserProfile } from '../types';
import { Send, User, ShieldAlert, Heart, Trophy, ShieldCheck, Trash2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import UserProfileModal from './UserProfileModal';
import { AnimatePresence } from 'motion/react';
import { containsProfanity, filterProfanity } from '../lib/filter';
import { cn } from '../lib/utils';
import { getUserProfile } from '../lib/userCache';

const CommentItem = memo(function CommentItem({ comment, isBestComment }: { comment: Comment, isBestComment?: boolean }) {
  const [authorProfile, setAuthorProfile] = useState<UserProfile | null>(null);
  const [authorNickname, setAuthorNickname] = useState<string>('Carregando...');
  const [showProfile, setShowProfile] = useState(false);
  const [isLiked, setIsLiked] = useState(false);
  const [likeLoading, setLikeLoading] = useState(false);
  const [currentUserProfile, setCurrentUserProfile] = useState<UserProfile | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    const fetchAuthor = async () => {
      try {
        const userProfile = await getUserProfile(comment.authorId);
        if (userProfile) {
          setAuthorProfile(userProfile);
          setAuthorNickname(userProfile.nickname);
        } else {
          setAuthorNickname('Usuário Anônimo');
        }
      } catch (error) {
        console.error("Error fetching author:", error);
        setAuthorNickname('Usuário');
      }
    };
    fetchAuthor();
  }, [comment.authorId]);

  useEffect(() => {
    const checkLike = async () => {
      if (!auth.currentUser) return;
      const likeRef = doc(db, 'comments', comment.id, 'likes', auth.currentUser.uid);
      const likeSnap = await getDoc(likeRef);
      setIsLiked(likeSnap.exists());
      
      const profile = await getUserProfile(auth.currentUser.uid);
      setCurrentUserProfile(profile);
    };
    checkLike();
  }, [comment.id]);

  const handleLike = async () => {
    if (!auth.currentUser || likeLoading) return;
    setLikeLoading(true);
    
    const likeRef = doc(db, 'comments', comment.id, 'likes', auth.currentUser.uid);
    const commentRef = doc(db, 'comments', comment.id);

    try {
      const batch = writeBatch(db);
      if (isLiked) {
        batch.delete(likeRef);
        batch.update(commentRef, { likes: increment(-1) });
        await batch.commit();
        setIsLiked(false);
      } else {
        batch.set(likeRef, { createdAt: serverTimestamp() });
        batch.update(commentRef, { likes: increment(1) });
        await batch.commit();
        setIsLiked(true);
      }
    } catch (error) {
      console.error("Error toggling like:", error);
    } finally {
      setLikeLoading(false);
    }
  };

  const isAdmin = currentUserProfile?.role === 'admin';
  const isOwner = auth.currentUser?.uid === comment.authorId;
  const canDelete = isOwner || isAdmin;

  const handleDelete = async () => {
    if (!auth.currentUser || !canDelete || isDeleting) return;
    if (!window.confirm("Tem certeza que deseja excluir este comentário?")) return;
    
    setIsDeleting(true);
    try {
      const batch = writeBatch(db);
      batch.delete(doc(db, 'comments', comment.id));
      batch.update(doc(db, 'confessions', comment.confessionId), {
        commentCount: increment(-1)
      });
      await batch.commit();
    } catch (error) {
      console.error("Error deleting comment:", error);
      setIsDeleting(false);
    }
  };

  return (
    <div className={cn(
      "rounded-lg p-3 relative",
      isBestComment ? "bg-yellow-500/10 border border-yellow-500/30" : "bg-zinc-800/50",
      authorProfile?.role === 'admin' ? "border border-pink-500/30" : ""
    )}>
      {isBestComment && (
        <div className="absolute -top-2 -right-2 bg-yellow-500 text-zinc-900 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center space-x-1 shadow-lg shadow-yellow-500/20">
          <Trophy className="w-3 h-3" />
          <span>Melhor Comentário</span>
        </div>
      )}
      <div className="flex items-center justify-between mb-1">
        <button 
          onClick={() => setShowProfile(true)}
          className="flex items-center space-x-1.5 hover:opacity-80 transition-opacity"
        >
          <div className="w-5 h-5 bg-pink-600/20 rounded-full flex items-center justify-center text-pink-500">
            {authorProfile?.avatar ? (
              <img src={authorProfile.avatar} alt="Avatar" className="w-full h-full object-cover rounded-full" />
            ) : (
              <User className="w-3 h-3" />
            )}
          </div>
          <div className="flex items-center space-x-1">
            <span className={cn("text-xs font-bold", authorProfile?.role === 'admin' ? "text-pink-400" : "text-zinc-300")}>
              {authorNickname}
            </span>
            {authorProfile?.isVerified && (
              <ShieldCheck className="w-3 h-3 text-blue-400" />
            )}
          </div>
        </button>
        <div className="flex items-center space-x-2">
          <span className="text-[10px] text-zinc-500">
            {comment.createdAt?.toDate ? formatDistanceToNow(comment.createdAt.toDate(), { addSuffix: true, locale: ptBR }) : 'agora'}
          </span>
          {canDelete && (
            <button
              onClick={handleDelete}
              disabled={isDeleting}
              className={cn("p-1 transition-colors", isAdmin && !isOwner ? "text-red-500 hover:text-red-400" : "text-zinc-500 hover:text-red-500")}
              title={isAdmin && !isOwner ? "Deletar como Admin" : "Deletar"}
            >
              <Trash2 className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>
      <p className="text-zinc-300 text-sm ml-6 mb-2">{comment.text}</p>
      
      <div className="flex items-center justify-end">
        <button 
          onClick={handleLike}
          disabled={likeLoading}
          className={cn(
            "flex items-center space-x-1 text-xs transition-colors",
            isLiked ? "text-pink-500" : "text-zinc-500 hover:text-pink-400"
          )}
        >
          <Heart className={cn("w-3.5 h-3.5", isLiked && "fill-current")} />
          <span>{comment.likes || 0}</span>
        </button>
      </div>

      <AnimatePresence>
        {showProfile && (
          <UserProfileModal 
            userId={comment.authorId} 
            onClose={() => setShowProfile(false)} 
          />
        )}
      </AnimatePresence>
    </div>
  );
});

export default function CommentSection({ confessionId }: { confessionId: string }) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const q = query(
      collection(db, 'comments'),
      where('confessionId', '==', confessionId)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const commentsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Comment[];
      
      // Sort in JS to avoid composite index requirements
      commentsData.sort((a, b) => {
        // First sort by likes (descending)
        const likesA = a.likes || 0;
        const likesB = b.likes || 0;
        if (likesB !== likesA) {
          return likesB - likesA;
        }
        // Then sort by date (ascending)
        const timeA = a.createdAt?.toDate?.()?.getTime() || 0;
        const timeB = b.createdAt?.toDate?.()?.getTime() || 0;
        return timeA - timeB;
      });
      
      setComments(commentsData);
    });

    return () => unsubscribe();
  }, [confessionId]);

  const bestCommentId = comments.length > 0 && (comments[0].likes || 0) > 0 ? comments[0].id : null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim() || !auth.currentUser || isSubmitting) return;

    if (containsProfanity(newComment)) {
      setError('Seu comentário contém palavras impróprias.');
      return;
    }

    setIsSubmitting(true);
    setError('');
    try {
      const filteredText = filterProfanity(newComment.trim());
      const batch = writeBatch(db);
      
      const newCommentRef = doc(collection(db, 'comments'));
      batch.set(newCommentRef, {
        confessionId,
        text: filteredText,
        createdAt: serverTimestamp(),
        authorId: auth.currentUser.uid
      });

      const confessionRef = doc(db, 'confessions', confessionId);
      batch.update(confessionRef, {
        commentCount: increment(1)
      });

      await batch.commit();

      setNewComment('');
    } catch (error) {
      console.error("Error adding comment:", error);
      setError('Erro ao enviar comentário.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-2 flex items-center space-x-2 text-red-400">
          <ShieldAlert className="w-4 h-4 shrink-0" />
          <p className="text-xs">{error}</p>
        </div>
      )}
      <div className="space-y-3 max-h-60 overflow-y-auto pr-2 custom-scrollbar">
        {comments.length === 0 ? (
          <p className="text-zinc-500 text-sm text-center py-2">Nenhum comentário ainda. Seja o primeiro!</p>
        ) : (
          comments.map(comment => (
            <CommentItem 
              key={comment.id} 
              comment={comment} 
              isBestComment={comment.id === bestCommentId}
            />
          ))
        )}
      </div>

      <form onSubmit={handleSubmit} className="flex items-center space-x-2">
        <input
          type="text"
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
          placeholder="Adicione um comentário..."
          className="flex-1 bg-zinc-800 border border-zinc-700 rounded-full px-4 py-2 text-sm text-zinc-100 focus:outline-none focus:border-pink-500/50 focus:ring-1 focus:ring-pink-500/50 transition-all"
          maxLength={1000}
        />
        <button
          type="submit"
          disabled={!newComment.trim() || isSubmitting}
          className="p-2 rounded-full bg-pink-600 text-white disabled:opacity-50 disabled:cursor-not-allowed hover:bg-pink-500 transition-colors"
        >
          <Send className="w-4 h-4" />
        </button>
      </form>
    </div>
  );
}
