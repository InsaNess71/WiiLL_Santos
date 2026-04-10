import React, { useState } from 'react';
import { CATEGORIES } from '../types';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { Send, X, ShieldAlert } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { containsProfanity, filterProfanity } from '../lib/filter';
import { moderateConfession } from '../services/geminiService';

interface CreateConfessionProps {
  onClose: () => void;
}

export default function CreateConfession({ onClose }: CreateConfessionProps) {
  const [text, setText] = useState('');
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [age, setAge] = useState('');
  const [gender, setGender] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim() || !auth.currentUser) return;

    if (containsProfanity(text)) {
      setError('Sua confissão contém palavras impróprias. Por favor, revise o texto.');
      return;
    }

    setIsSubmitting(true);
    setError('');

    try {
      // 1. AI Moderation Check
      const moderation = await moderateConfession(text);
      if (!moderation.isApproved) {
        setError(`Confissão bloqueada pela moderação: ${moderation.reason || 'Viola as diretrizes de segurança.'}`);
        setIsSubmitting(false);
        return;
      }

      // 2. Filter profanity and save
      const filteredText = filterProfanity(text.trim());
      
      const confessionData: any = {
        text: filteredText,
        category,
        likes: 0,
        commentCount: 0,
        judgement: { right: 0, wrong: 0 },
        createdAt: serverTimestamp(),
        authorId: auth.currentUser.uid
      };

      if (age) confessionData.age = parseInt(age);
      if (gender) confessionData.gender = gender;

      await addDoc(collection(db, 'confessions'), confessionData);
      onClose();
    } catch (err) {
      console.error("Error creating confession:", err);
      setError('Ocorreu um erro ao postar sua confissão. Tente novamente.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl"
      >
        <div className="flex items-center justify-between p-4 border-b border-zinc-800">
          <h2 className="text-lg font-semibold text-zinc-100">Nova Confissão</h2>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-200 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 flex items-start space-x-2 text-red-400">
              <ShieldAlert className="w-5 h-5 shrink-0 mt-0.5" />
              <p className="text-sm">{error}</p>
            </div>
          )}

          <div>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Qual é o seu segredo? Ninguém vai saber que foi você..."
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-4 text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-pink-500/50 focus:ring-1 focus:ring-pink-500/50 resize-none h-32 transition-all"
              maxLength={2000}
              required
            />
            <div className="text-right text-xs text-zinc-500 mt-1">
              {text.length}/2000
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-400 mb-1.5">Categoria</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-zinc-100 focus:outline-none focus:border-pink-500/50 focus:ring-1 focus:ring-pink-500/50"
            >
              {CATEGORIES.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-1.5">Idade (Opcional)</label>
              <input
                type="number"
                value={age}
                onChange={(e) => setAge(e.target.value)}
                placeholder="Ex: 25"
                min="13"
                max="120"
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-zinc-100 focus:outline-none focus:border-pink-500/50 focus:ring-1 focus:ring-pink-500/50"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-1.5">Gênero (Opcional)</label>
              <input
                type="text"
                value={gender}
                onChange={(e) => setGender(e.target.value)}
                placeholder="Ex: Mulher"
                maxLength={50}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-zinc-100 focus:outline-none focus:border-pink-500/50 focus:ring-1 focus:ring-pink-500/50"
              />
            </div>
          </div>

          <div className="pt-4 flex justify-end">
            <button
              type="submit"
              disabled={!text.trim() || isSubmitting}
              className="flex items-center space-x-2 bg-pink-600 hover:bg-pink-500 text-white px-6 py-2.5 rounded-full font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span>{isSubmitting ? 'Enviando...' : 'Confessar'}</span>
              {!isSubmitting && <Send className="w-4 h-4" />}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
