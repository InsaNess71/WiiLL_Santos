import React, { useState } from 'react';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { motion } from 'motion/react';
import { ShieldAlert, ArrowRight } from 'lucide-react';
import { ADMIN_AVATAR } from '../types';

interface NicknameModalProps {
  onComplete: () => void;
}

export default function NicknameModal({ onComplete }: NicknameModalProps) {
  const [nickname, setNickname] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser) return;
    
    const trimmed = nickname.trim();
    if (trimmed.length < 3 || trimmed.length > 20) {
      setError('O nickname deve ter entre 3 e 20 caracteres.');
      return;
    }

    const forbidden = /porno|sexo|puta|caralho|buceta|pau|cu|foda/i;
    if (forbidden.test(trimmed)) {
      setError('Este nickname contém palavras não permitidas.');
      return;
    }

    setIsSubmitting(true);
    setError('');

    try {
      const isAdmin = auth.currentUser.email === 'wiillsantos16@gmail.com' && auth.currentUser.emailVerified;
      
      const userData: any = {
        nickname: trimmed,
        createdAt: serverTimestamp(),
        lastActive: serverTimestamp()
      };

      if (isAdmin) {
        userData.role = 'admin';
        userData.isVerified = true;
        userData.avatar = ADMIN_AVATAR;
      }

      await setDoc(doc(db, 'users', auth.currentUser.uid), userData);
      onComplete();
    } catch (err) {
      console.error('Error setting nickname:', err);
      setError('Erro ao salvar nickname. Tente novamente.');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl p-6"
      >
        <h2 className="text-xl font-bold text-zinc-100 mb-2">Crie seu Nickname</h2>
        <p className="text-sm text-zinc-400 mb-6">
          Para conversar no chat privado, você precisa de um apelido. Ele será sua única identificação.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 flex items-start space-x-2 text-red-400">
              <ShieldAlert className="w-5 h-5 shrink-0 mt-0.5" />
              <p className="text-sm">{error}</p>
            </div>
          )}

          <div>
            <input
              type="text"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="Ex: Fantasma42"
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-pink-500/50 focus:ring-1 focus:ring-pink-500/50 transition-all"
              maxLength={20}
              required
            />
          </div>

          <button
            type="submit"
            disabled={!nickname.trim() || isSubmitting}
            className="w-full flex items-center justify-center space-x-2 bg-pink-600 hover:bg-pink-500 text-white px-6 py-3 rounded-xl font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <span>{isSubmitting ? 'Salvando...' : 'Continuar'}</span>
            {!isSubmitting && <ArrowRight className="w-4 h-4" />}
          </button>
        </form>
      </motion.div>
    </div>
  );
}
