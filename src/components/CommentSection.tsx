import React, { useState, useEffect } from 'react';
import { collection, query, where, orderBy, onSnapshot, addDoc, serverTimestamp, doc, updateDoc, increment, getDoc } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { Comment } from '../types';
import { Send, User } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import UserProfileModal from './UserProfileModal';
import { AnimatePresence } from 'motion/react';

function CommentItem({ comment }: { comment: Comment }) {
  const [authorNickname, setAuthorNickname] = useState<string>('Carregando...');
  const [showProfile, setShowProfile] = useState(false);

  useEffect(() => {
    const fetchAuthor = async () => {
      try {
        const userDoc = await getDoc(doc(db, 'users', comment.authorId));
        if (userDoc.exists()) {
          setAuthorNickname(userDoc.data().nickname);
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

  return (
    <div className="bg-zinc-800/50 rounded-lg p-3">
      <div className="flex items-center justify-between mb-1">
        <button 
          onClick={() => setShowProfile(true)}
          className="flex items-center space-x-1.5 hover:opacity-80 transition-opacity"
        >
          <div className="w-5 h-5 bg-pink-600/20 rounded-full flex items-center justify-center text-pink-500">
            <User className="w-3 h-3" />
          </div>
          <span className="text-xs font-bold text-zinc-300">{authorNickname}</span>
        </button>
        <span className="text-[10px] text-zinc-500">
          {comment.createdAt?.toDate ? formatDistanceToNow(comment.createdAt.toDate(), { addSuffix: true, locale: ptBR }) : 'agora'}
        </span>
      </div>
      <p className="text-zinc-300 text-sm ml-6">{comment.text}</p>

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
}

export default function CommentSection({ confessionId }: { confessionId: string }) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

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
        const timeA = a.createdAt?.toDate?.()?.getTime() || 0;
        const timeB = b.createdAt?.toDate?.()?.getTime() || 0;
        return timeA - timeB; // asc
      });
      
      setComments(commentsData);
    });

    return () => unsubscribe();
  }, [confessionId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim() || !auth.currentUser || isSubmitting) return;

    setIsSubmitting(true);
    try {
      await addDoc(collection(db, 'comments'), {
        confessionId,
        text: newComment.trim(),
        createdAt: serverTimestamp(),
        authorId: auth.currentUser.uid
      });

      await updateDoc(doc(db, 'confessions', confessionId), {
        commentCount: increment(1)
      });

      setNewComment('');
    } catch (error) {
      console.error("Error adding comment:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-3 max-h-60 overflow-y-auto pr-2 custom-scrollbar">
        {comments.length === 0 ? (
          <p className="text-zinc-500 text-sm text-center py-2">Nenhum comentário ainda. Seja o primeiro!</p>
        ) : (
          comments.map(comment => (
            <CommentItem key={comment.id} comment={comment} />
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
