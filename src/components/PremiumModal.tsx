import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Crown, Check, X, Camera, MessageSquare, Sparkles, ShieldCheck } from 'lucide-react';
import { db, auth, handleFirestoreError, OperationType } from '../firebase';
import { doc, updateDoc } from 'firebase/firestore';

interface PremiumModalProps {
  onClose: () => void;
}

export default function PremiumModal({ onClose }: PremiumModalProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const handleSubscribe = async () => {
    if (!auth.currentUser) return;
    
    if (auth.currentUser.isAnonymous) {
      alert("Visitantes não podem assinar o Premium. Por favor, entre com uma conta Google para salvar seu progresso e assinar.");
      return;
    }

    setIsProcessing(true);
    
    console.log("Iniciando checkout session...");
    try {
      const response = await fetch('/api/create-checkout-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: auth.currentUser.uid,
        }),
      });
      console.log(`Resposta Checkout: ${response.status}`);

      if (!response.ok) {
        const text = await response.text();
        console.error("Server error response:", text);
        let errorMessage = `Erro no servidor (${response.status})`;
        if (text.includes('NOT_FOUND') || text.includes('could not be found')) {
          errorMessage = 'Servidor não encontrado (404). Verifique se a rota da API está correta.';
        } else {
          errorMessage += `: ${text.slice(0, 50)}...`;
        }
        throw new Error(errorMessage);
      }

      const data = await response.json();

      if (data.url) {
        const stripeWindow = window.open(data.url, '_blank');
        if (!stripeWindow) {
          // Fallback if popup is blocked
          window.location.href = data.url;
        }
        onClose();
      } else {
        throw new Error(data.error || 'Erro ao criar sessão de pagamento');
      }
    } catch (error: any) {
      console.error("Payment Error:", error);
      alert(error.message || "Erro ao iniciar pagamento. Verifique suas chaves do Stripe.");
    } finally {
      setIsProcessing(false);
    }
  };

  const FEATURES = [
    {
      icon: Camera,
      title: 'Fotos nas Confissões',
      desc: 'Dê vida aos seus segredos anexando imagens reais.'
    },
    {
      icon: MessageSquare,
      title: 'Multimídia no Chat',
      desc: 'Envie e receba fotos em conversas privadas.'
    },
    {
      icon: Crown,
      title: 'Selo de Prestígio',
      desc: 'Destaque-se na comunidade com o selo Premium.'
    },
    {
      icon: ShieldCheck,
      title: 'Moderação Prioritária',
      desc: 'Suas denúncias e posts são analisados com prioridade.'
    }
  ];

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/90 backdrop-blur-xl">
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="bg-zinc-900 border border-zinc-800 rounded-[2.5rem] w-full max-w-lg overflow-hidden shadow-2xl relative"
      >
        <button 
          onClick={onClose}
          className="absolute top-6 right-6 p-2 text-zinc-500 hover:text-zinc-300 transition-colors z-10"
        >
          <X className="w-6 h-6" />
        </button>

        {/* Header with Gradient */}
        <div className="relative h-48 bg-gradient-to-br from-pink-600 via-purple-600 to-indigo-700 flex flex-col items-center justify-center text-white overflow-hidden">
          <div className="absolute inset-0 opacity-20">
            <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_50%_50%,rgba(255,255,255,0.2),transparent_70%)]" />
          </div>
          <motion.div
            animate={{ 
              rotate: [0, 10, -10, 0],
              scale: [1, 1.1, 1]
            }}
            transition={{ duration: 4, repeat: Infinity }}
            className="bg-white/20 backdrop-blur-md p-4 rounded-3xl mb-4"
          >
            <Crown className="w-12 h-12 text-yellow-400 fill-yellow-400" />
          </motion.div>
          <h2 className="text-3xl font-black tracking-tighter uppercase italic">Confissões Premium</h2>
        </div>

        <div className="p-8">
          {isSuccess ? (
            <motion.div 
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              className="text-center py-12"
            >
              <div className="w-20 h-20 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
                <Check className="w-12 h-12 text-green-500" />
              </div>
              <h3 className="text-2xl font-bold text-zinc-100 mb-2">Bem-vindo ao Clube!</h3>
              <p className="text-zinc-400">Seu perfil agora é Premium. Aproveite todos os recursos.</p>
            </motion.div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-10">
                {FEATURES.map((f, i) => (
                  <div key={i} className="flex items-start space-x-3">
                    <div className="bg-zinc-800 p-2 rounded-xl shrink-0">
                      <f.icon className="w-5 h-5 text-pink-500" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-zinc-100">{f.title}</h4>
                      <p className="text-xs text-zinc-500 mt-0.5 leading-relaxed">{f.desc}</p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="space-y-4">
                <button
                  onClick={handleSubscribe}
                  disabled={isProcessing}
                  className="w-full py-5 bg-white text-zinc-950 rounded-2xl font-black text-lg hover:bg-zinc-100 transition-all shadow-xl shadow-white/5 active:scale-[0.98] disabled:opacity-50"
                >
                  {isProcessing ? 'Processando...' : 'Assinar por R$ 14,99 / mês'}
                </button>
                <p className="text-[10px] text-center text-zinc-600 px-8">
                  Ao assinar, você concorda com nossos Termos de Uso. O acesso Premium é válido por 30 dias e pode ser renovado.
                </p>
              </div>
            </>
          )}
        </div>
      </motion.div>
    </div>
  );
}
