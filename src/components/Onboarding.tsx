import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Ghost, Bot, Sparkles, Trophy, Flame, Clock, MessageSquare, ChevronRight, Check } from 'lucide-react';
import { cn } from '../lib/utils';

interface OnboardingProps {
  onComplete: () => void;
}

const STEPS = [
  {
    id: 'anonimato',
    title: 'Seu espaço seguro',
    description: 'Aqui, seus segredos estão protegidos. Desabafe, conte histórias ou peça ajuda sem que ninguém saiba quem você é.',
    icon: Ghost,
    color: 'text-pink-500',
    bgColor: 'bg-pink-500/10',
    borderColor: 'border-pink-500/20'
  },
  {
    id: 'ia',
    title: 'Conselheiro Virtual',
    description: 'Nunca esteja sozinho. Precisa de um conselho agora? Nossa IA está pronta para te ouvir e dar uma perspectiva diferente.',
    icon: Bot,
    extraIcon: Sparkles,
    color: 'text-indigo-400',
    bgColor: 'bg-indigo-500/10',
    borderColor: 'border-indigo-500/20'
  },
  {
    id: 'karma',
    title: 'Sua voz tem valor',
    description: 'Reaja às confissões, julgue o que é certo ou errado e ganhe Karma por ajudar a comunidade com bons conselhos.',
    icon: Trophy,
    extraIcon: Flame,
    color: 'text-yellow-500',
    bgColor: 'bg-yellow-500/10',
    borderColor: 'border-yellow-500/20'
  },
  {
    id: 'chats',
    title: 'Privacidade Total',
    description: 'Inicie chats privados que se apagam sozinhos após 1h ou 24h. O que acontece aqui, fica aqui.',
    icon: MessageSquare,
    extraIcon: Clock,
    color: 'text-cyan-400',
    bgColor: 'bg-cyan-500/10',
    borderColor: 'border-cyan-500/20'
  }
];

export default function Onboarding({ onComplete }: OnboardingProps) {
  const [currentStep, setCurrentStep] = useState(0);

  const handleNext = () => {
    if (currentStep < STEPS.length - 1) {
      setCurrentStep(prev => prev + 1);
    } else {
      onComplete();
    }
  };

  const step = STEPS[currentStep];
  const Icon = step.icon;
  const ExtraIcon = step.extraIcon;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-zinc-950 p-4 sm:p-6 overflow-hidden">
      {/* Background Glow */}
      <div className={cn(
        "absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] h-[300px] blur-[120px] rounded-full transition-colors duration-700 opacity-20",
        step.id === 'anonimato' && "bg-pink-500",
        step.id === 'ia' && "bg-indigo-500",
        step.id === 'karma' && "bg-yellow-500",
        step.id === 'chats' && "bg-cyan-500"
      )} />

      <div className="max-w-md w-full relative z-10">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentStep}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.4, ease: "easeOut" }}
            className="flex flex-col items-center text-center"
          >
            <div className={cn(
              "w-24 h-24 rounded-3xl flex items-center justify-center mb-8 border relative",
              step.bgColor,
              step.borderColor
            )}>
              <Icon className={cn("w-12 h-12", step.color)} />
              {ExtraIcon && (
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 0.2 }}
                  className="absolute -top-2 -right-2 bg-zinc-900 border border-zinc-800 p-1.5 rounded-lg shadow-xl"
                >
                  <ExtraIcon className={cn("w-4 h-4", step.color)} />
                </motion.div>
              )}
            </div>

            <h2 className="text-3xl font-bold text-zinc-100 mb-4 tracking-tight">
              {step.title}
            </h2>
            
            <p className="text-zinc-400 text-lg leading-relaxed mb-12">
              {step.description}
            </p>
          </motion.div>
        </AnimatePresence>

        {/* Progress Dots */}
        <div className="flex justify-center space-x-2 mb-12">
          {STEPS.map((_, idx) => (
            <div
              key={idx}
              className={cn(
                "h-1.5 rounded-full transition-all duration-300",
                idx === currentStep ? "w-8 bg-pink-500" : "w-1.5 bg-zinc-800"
              )}
            />
          ))}
        </div>

        {/* Action Button */}
        <button
          onClick={handleNext}
          className={cn(
            "w-full py-4 rounded-2xl font-bold text-lg flex items-center justify-center space-x-2 transition-all shadow-xl",
            currentStep === STEPS.length - 1 
              ? "bg-pink-600 hover:bg-pink-500 text-white shadow-pink-500/20" 
              : "bg-zinc-100 hover:bg-white text-zinc-950"
          )}
        >
          <span>{currentStep === STEPS.length - 1 ? 'Começar a Confessar' : 'Próximo'}</span>
          {currentStep === STEPS.length - 1 ? (
            <Check className="w-5 h-5" />
          ) : (
            <ChevronRight className="w-5 h-5" />
          )}
        </button>

        {/* Skip Button */}
        {currentStep < STEPS.length - 1 && (
          <button
            onClick={onComplete}
            className="w-full mt-4 py-2 text-zinc-500 hover:text-zinc-300 text-sm font-medium transition-colors"
          >
            Pular tutorial
          </button>
        )}
      </div>
    </div>
  );
}
