import React, { useState, useEffect, memo } from 'react';
import { collection, query, where, orderBy, onSnapshot, addDoc, serverTimestamp, doc, updateDoc, increment, getDoc, writeBatch, deleteDoc, or, and } from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType } from '../firebase';
import { Comment, UserProfile, REPORT_REASONS } from '../types';
import { Send, User, ShieldAlert, Heart, Trophy, ShieldCheck, Trash2, AlertTriangle, X } from 'lucide-react';

import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import UserProfileModal from './UserProfileModal';
import { motion, AnimatePresence } from 'motion/react';
import { containsProfanity, filterProfanity } from '../lib/filter';
import { cn } from '../lib/utils';
import { getUserProfile } from '../lib/userCache';

const CommentItem = memo(function CommentItem({ comment, isBestComment, onReply, onMarkAsBest, canMarkAsBest }: { comment: Comment, isBestComment?: boolean, onReply?: (nickname: string) => void, onMarkAsBest?: () => void, canMarkAsBest?: boolean }) {
  const [authorProfile, setAuthorProfile] = useState<UserProfile | null>(null);
  const [authorNickname, setAuthorNickname] = useState<string>('');
  const [showProfile, setShowProfile] = useState(false);
  const [isLiked, setIsLiked] = useState(false);
  const [likeLoading, setLikeLoading] = useState(false);
  const [currentUserProfile, setCurrentUserProfile] = useState<UserProfile | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportReason, setReportReason] = useState('');
  const [isReporting, setIsReporting] = useState(false);
  const [hasReported, setHasReported] = useState(false);

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

    const handleProfileUpdate = (e: any) => {
      const { userId, profile: updatedProfile } = e.detail;
      if (userId === comment.authorId) {
        setAuthorProfile(prev => prev ? { ...prev, ...updatedProfile } : updatedProfile);
        if (updatedProfile.nickname) {
          setAuthorNickname(updatedProfile.nickname);
        }
      }
      if (auth.currentUser && userId === auth.currentUser.uid) {
        setCurrentUserProfile(prev => prev ? { ...prev, ...updatedProfile } : updatedProfile);
      }
    };

    window.addEventListener('userProfileUpdated', handleProfileUpdate);
    return () => window.removeEventListener('userProfileUpdated', handleProfileUpdate);
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
      const authorRef = doc(db, 'users', comment.authorId);
      
      if (isLiked) {
        batch.delete(likeRef);
        batch.update(commentRef, { likes: increment(-1) });
        batch.update(authorRef, { karma: increment(-1) });
        setIsLiked(false);
        await batch.commit();
      } else {
        batch.set(likeRef, { createdAt: serverTimestamp() });
        batch.update(commentRef, { likes: increment(1) });
        batch.update(authorRef, { karma: increment(1) });
        setIsLiked(true);
        await batch.commit();
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `comments/${comment.id}/likes`);
      setIsLiked(!isLiked); // Revert
    } finally {
      setLikeLoading(false);
    }
  };

  const isAdmin = currentUserProfile?.role === 'admin' || auth.currentUser?.email === 'wiillsantos16@gmail.com';
  const isOwner = auth.currentUser?.uid === comment.authorId;
  const canDelete = isOwner || isAdmin;

  const handleDelete = async () => {
    if (!auth.currentUser || !canDelete || isDeleting) return;
    
    setIsDeleting(true);
    try {
      const batch = writeBatch(db);
      batch.delete(doc(db, 'comments', comment.id));
      batch.update(doc(db, 'confessions', comment.confessionId), {
        commentCount: increment(-1)
      });
      await batch.commit();
    } catch (error: any) {
      handleFirestoreError(error, OperationType.DELETE, `comments/${comment.id}`);
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  const handleReport = async () => {
    if (!auth.currentUser || hasReported || isReporting || !reportReason) return;
    setIsReporting(true);
    try {
      await addDoc(collection(db, 'reports'), {
        commentId: comment.id,
        confessionId: comment.confessionId,
        reportedBy: auth.currentUser.uid,
        reason: reportReason,
        createdAt: serverTimestamp(),
        status: 'pending',
        type: 'comment'
      });
      setHasReported(true);
      setShowReportModal(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'reports');
    } finally {
      setIsReporting(false);
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
              {authorNickname || 'Carregando...'}
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
              onClick={() => setShowDeleteConfirm(true)}
              disabled={isDeleting}
              className={cn("p-1 transition-colors", isAdmin && !isOwner ? "text-red-500 hover:text-red-400" : "text-zinc-500 hover:text-red-500")}
              title={isAdmin && !isOwner ? "Deletar como Admin" : "Deletar"}
            >
              <Trash2 className="w-3 h-3" />
            </button>
          )}
          {!isOwner && !hasReported && (
            <button
              onClick={() => setShowReportModal(true)}
              className="p-1 text-zinc-500 hover:text-yellow-500 transition-colors"
              title="Denunciar"
            >
              <AlertTriangle className="w-3 h-3" />
            </button>
          )}
          {hasReported && (
            <span className="text-[10px] text-red-500 font-medium">Denunciado</span>
          )}
        </div>
      </div>
      <p className="text-zinc-300 text-sm ml-6 mb-2">{comment.text}</p>
      
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3 ml-6">
          <button 
            onClick={() => authorNickname && onReply?.(authorNickname)} 
            className="text-xs text-zinc-500 hover:text-zinc-300 font-medium transition-colors"
          >
            Responder
          </button>
          {canMarkAsBest && !comment.isBest && (
            <button 
              onClick={onMarkAsBest}
              className="text-[10px] bg-yellow-500/10 text-yellow-500 border border-yellow-500/20 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider hover:bg-yellow-500/20 transition-all"
            >
              Marcar como Melhor
            </button>
          )}
          {comment.isBest && (
            <div className="flex items-center space-x-1 text-yellow-500">
              <Trophy className="w-3 h-3" />
              <span className="text-[10px] font-bold uppercase tracking-wider">Melhor Resposta</span>
            </div>
          )}
        </div>
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
        {showDeleteConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-10 bg-zinc-900/95 backdrop-blur-sm rounded-lg flex flex-col items-center justify-center p-2 text-center"
          >
            <p className="text-[10px] font-bold text-zinc-100 mb-2">Excluir comentário?</p>
            <div className="flex items-center space-x-2 w-full px-4">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                disabled={isDeleting}
                className="flex-1 py-1 rounded-md text-[10px] font-medium text-zinc-300 bg-zinc-800 hover:bg-zinc-700 transition-colors"
              >
                Não
              </button>
              <button
                onClick={handleDelete}
                disabled={isDeleting}
                className="flex-1 py-1 rounded-md text-[10px] font-medium text-white bg-red-600 hover:bg-red-700 transition-colors flex items-center justify-center"
              >
                {isDeleting ? <div className="w-2 h-2 border border-white/30 border-t-white rounded-full animate-spin" /> : 'Sim'}
              </button>
            </div>
          </motion.div>
        )}

        {showProfile && (
          <UserProfileModal 
            userId={comment.authorId} 
            onClose={() => setShowProfile(false)} 
          />
        )}

        {showReportModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 w-full max-w-sm shadow-2xl"
            >
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-bold text-zinc-100">Denunciar Comentário</h3>
                <button onClick={() => setShowReportModal(false)} className="text-zinc-500 hover:text-zinc-300">
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <p className="text-sm text-zinc-400 mb-4">Por que você está denunciando este comentário?</p>
              
              <div className="space-y-2 mb-6">
                {REPORT_REASONS.map(reason => (
                  <button
                    key={reason}
                    onClick={() => setReportReason(reason)}
                    className={cn(
                      "w-full text-left p-3 rounded-xl text-sm transition-all border",
                      reportReason === reason 
                        ? "bg-pink-600/20 border-pink-500 text-pink-100" 
                        : "bg-zinc-950 border-zinc-800 text-zinc-400 hover:border-zinc-700"
                    )}
                  >
                    {reason}
                  </button>
                ))}
              </div>
              
              <button
                onClick={handleReport}
                disabled={!reportReason || isReporting}
                className="w-full py-3 bg-pink-600 hover:bg-pink-700 disabled:opacity-50 disabled:hover:bg-pink-600 text-white rounded-xl font-bold transition-all shadow-lg shadow-pink-500/20"
              >
                {isReporting ? 'Enviando...' : 'Enviar Denúncia'}
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
});

interface CommentSectionProps {
  confessionId: string;
  confessionText: string;
  confessionAuthorId: string;
}

export default function CommentSection({ confessionId, confessionText, confessionAuthorId }: CommentSectionProps) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const inputRef = React.useRef<HTMLInputElement>(null);

  useEffect(() => {
    const q = query(
      collection(db, 'comments'),
      and(
        where('confessionId', '==', confessionId),
        or(
          where('isHidden', '==', false),
          where('authorId', '==', auth.currentUser?.uid || 'anonymous')
        )
      )
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const commentsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data({ serverTimestamps: 'estimate' })
      })) as Comment[];
      
      // Sort in JS to avoid composite index requirements
      const filteredComments = [...commentsData];
      
      filteredComments.sort((a, b) => {
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
      
      setComments(filteredComments);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'comments');
    });

    return () => unsubscribe();
  }, [confessionId]);

  const bestCommentId = comments.length > 0 && (comments[0].likes || 0) > 0 ? comments[0].id : null;

  const handleMarkAsBest = async (commentId: string, authorId: string) => {
    if (!auth.currentUser || auth.currentUser.uid !== confessionAuthorId) return;
    
    try {
      const batch = writeBatch(db);
      batch.update(doc(db, 'comments', commentId), { isBest: true });
      batch.update(doc(db, 'users', authorId), { karma: increment(10) });
      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `comments/${commentId}`);
    }
  };

  const handleReply = (nickname: string) => {
    if (!nickname || nickname === 'Carregando...') return;
    
    // Force the input to ONLY contain the mention of the person being replied to.
    setNewComment(`@${nickname} `);
    
    // Focus the input using ref
    setTimeout(() => {
      inputRef.current?.focus();
    }, 10);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim() || !auth.currentUser || isSubmitting) return;

    if (containsProfanity(newComment)) {
      setError('Seu comentário contém palavras impróprias.');
      return;
    }

    setIsSubmitting(true);
    setError('');
    
    const filteredText = filterProfanity(newComment.trim());

    try {
      const userDoc = await getDoc(doc(db, 'users', auth.currentUser.uid));
      const isShadowBanned = userDoc.exists() && userDoc.data().isShadowBanned === true;

      const batch = writeBatch(db);
      
      const newCommentRef = doc(collection(db, 'comments'));
      batch.set(newCommentRef, {
        confessionId,
        text: filteredText,
        createdAt: serverTimestamp(),
        authorId: auth.currentUser.uid,
        isHidden: isShadowBanned
      });

      const confessionRef = doc(db, 'confessions', confessionId);
      batch.update(confessionRef, {
        commentCount: increment(1)
      });

      await batch.commit();
      setNewComment('');

      // Send Push Notification to confession author
      if (auth.currentUser.uid !== confessionAuthorId) {
        try {
          await fetch('/api/notify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userId: confessionAuthorId,
              title: 'Novo Comentário',
              body: `Alguém comentou na sua confissão: "${filteredText.slice(0, 50)}..."`,
              data: { confessionId, type: 'comment' }
            })
          });
        } catch (err) {
          console.error("Erro ao enviar notificação de comentário:", err);
        }
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `comments`);
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
              onReply={handleReply}
              canMarkAsBest={auth.currentUser?.uid === confessionAuthorId}
              onMarkAsBest={() => handleMarkAsBest(comment.id, comment.authorId)}
            />
          ))
        )}
      </div>

      <form onSubmit={handleSubmit} className="flex items-center space-x-2">
        <input
          ref={inputRef}
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
