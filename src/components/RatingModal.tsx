import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Star, X, MessageSquareHeart, Send, CheckCircle2 } from 'lucide-react';
import { db, auth } from '../firebase';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';

interface RatingModalProps {
  onClose: () => void;
}

export default function RatingModal({ onClose }: RatingModalProps) {
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [step, setStep] = useState<'stars' | 'feedback' | 'thanks'>('stars');
  const [feedback, setFeedback] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleRatingClick = (value: number) => {
    setRating(value);
    if (value >= 4) {
      // Positive rating: Redirect to Play Store (simulated here)
      // In a real app, you'd use window.open('market://details?id=YOUR_APP_ID')
      setStep('thanks');
      localStorage.setItem('confissoes_rated', 'true');
    } else {
      // Negative/Neutral: Ask for feedback
      setStep('feedback');
    }
  };

  const handleSubmitFeedback = async () => {
    if (!feedback.trim()) return;
    setIsSubmitting(true);
    try {
      await addDoc(collection(db, 'internal_feedback'), {
        userId: auth.currentUser?.uid || 'anonymous',
        rating,
        text: feedback.trim(),
        createdAt: serverTimestamp()
      });
      setStep('thanks');
      localStorage.setItem('confissoes_rated', 'true');
    } catch (error) {
      console.error("Error saving feedback:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 20 }}
        className="bg-zinc-900 border border-zinc-800 rounded-3xl w-full max-w-sm overflow-hidden shadow-2xl relative"
      >
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 p-1 text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="p-8 text-center">
          <AnimatePresence mode="wait">
            {step === 'stars' && (
              <motion.div
                key="stars"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <div className="w-16 h-16 bg-pink-500/10 rounded-2xl flex items-center justify-center mx-auto mb-6">
                  <MessageSquareHeart className="w-8 h-8 text-pink-500" />
                </div>
                <h2 className="text-xl font-bold text-zinc-100 mb-2">Gostando do App?</h2>
                <p className="text-zinc-400 text-sm mb-8">Sua opinião é muito importante para continuarmos melhorando!</p>
                
                <div className="flex justify-center space-x-2 mb-4">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      onMouseEnter={() => setHover(star)}
                      onMouseLeave={() => setHover(0)}
                      onClick={() => handleRatingClick(star)}
                      className="p-1 transition-transform hover:scale-125 active:scale-95"
                    >
                      <Star 
                        className={`w-10 h-10 transition-colors ${
                          star <= (hover || rating) 
                            ? 'fill-yellow-500 text-yellow-500' 
                            : 'text-zinc-700'
                        }`} 
                      />
                    </button>
                  ))}
                </div>
                <p className="text-xs text-zinc-600">Toque em uma estrela para avaliar</p>
              </motion.div>
            )}

            {step === 'feedback' && (
              <motion.div
                key="feedback"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
              >
                <h2 className="text-xl font-bold text-zinc-100 mb-2">Como podemos melhorar?</h2>
                <p className="text-zinc-400 text-sm mb-6">Sentimos muito que sua experiência não tenha sido 5 estrelas. Conte-nos o que houve:</p>
                
                <textarea
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  placeholder="Seu feedback..."
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-4 text-zinc-100 text-sm focus:outline-none focus:border-pink-500/50 h-32 resize-none mb-4"
                />

                <button
                  onClick={handleSubmitFeedback}
                  disabled={isSubmitting || !feedback.trim()}
                  className="w-full py-3 bg-zinc-100 hover:bg-white text-zinc-950 rounded-xl font-bold flex items-center justify-center space-x-2 disabled:opacity-50 transition-all"
                >
                  <Send className="w-4 h-4" />
                  <span>{isSubmitting ? 'Enviando...' : 'Enviar Feedback'}</span>
                </button>
              </motion.div>
            )}

            {step === 'thanks' && (
              <motion.div
                key="thanks"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                className="py-6"
              >
                <div className="w-16 h-16 bg-green-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
                  <CheckCircle2 className="w-10 h-10 text-green-500" />
                </div>
                <h2 className="text-xl font-bold text-zinc-100 mb-2">Obrigado pelo carinho!</h2>
                <p className="text-zinc-400 text-sm mb-8">
                  {rating >= 4 
                    ? "Sua avaliação positiva nos ajuda a levar o app para mais pessoas." 
                    : "Recebemos seu feedback e vamos trabalhar para melhorar."}
                </p>
                <button
                  onClick={onClose}
                  className="w-full py-3 bg-pink-600 hover:bg-pink-500 text-white rounded-xl font-bold transition-all"
                >
                  Continuar
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
}
