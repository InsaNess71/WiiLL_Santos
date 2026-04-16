import React, { useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Download, Share2, User, Flame, Ghost } from 'lucide-react';
import { toPng } from 'html-to-image';
import { Confession, UserProfile } from '../types';
import { cn } from '../lib/utils';

interface ShareModalProps {
  confession: Confession;
  authorNickname: string;
  authorAvatar: string | null;
  authorProfile: UserProfile | null;
  onClose: () => void;
}

export default function ShareModal({ confession, authorNickname, authorAvatar, authorProfile, onClose }: ShareModalProps) {
  const shareRef = useRef<HTMLDivElement>(null);
  const [isExporting, setIsExporting] = useState(false);

  const handleDownload = async () => {
    if (!shareRef.current || isExporting) return;
    setIsExporting(true);
    try {
      const dataUrl = await toPng(shareRef.current, {
        cacheBust: true,
        backgroundColor: '#09090b',
        pixelRatio: 2, // High quality
      });
      const link = document.createElement('a');
      link.download = `confissao-${confession.id.slice(0, 5)}.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error('Error exporting image:', err);
    } finally {
      setIsExporting(false);
    }
  };

  const handleShare = async () => {
    if (!shareRef.current || isExporting) return;
    setIsExporting(true);
    try {
      const dataUrl = await toPng(shareRef.current, {
        cacheBust: true,
        backgroundColor: '#09090b',
        pixelRatio: 2,
      });
      
      const blob = await (await fetch(dataUrl)).blob();
      const file = new File([blob], 'confissao.png', { type: 'image/png' });

      if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: 'Confissão Anônima',
          text: 'Olha essa confissão que vi no app!',
        });
      } else {
        // Fallback to download
        handleDownload();
      }
    } catch (err) {
      console.error('Error sharing image:', err);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-black/95 backdrop-blur-xl">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-sm flex flex-col items-center"
      >
        <div className="w-full flex justify-between items-center mb-4 px-2">
          <h3 className="text-zinc-100 font-bold">Visualização de Compartilhamento</h3>
          <button onClick={onClose} className="p-2 text-zinc-500 hover:text-zinc-300">
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* The Shareable Card */}
        <div 
          ref={shareRef}
          className="w-full aspect-[9/16] bg-zinc-950 rounded-[2.5rem] p-8 flex flex-col justify-between relative overflow-hidden border border-zinc-800 shadow-2xl"
          style={{ width: '320px', height: '568px' }} // Fixed size for consistent export
        >
          {/* Background Decoration */}
          <div className="absolute top-0 left-0 w-full h-full opacity-30 pointer-events-none">
            <div className="absolute top-[-10%] right-[-10%] w-64 h-64 bg-pink-600/20 blur-[100px] rounded-full" />
            <div className="absolute bottom-[-10%] left-[-10%] w-64 h-64 bg-purple-600/20 blur-[100px] rounded-full" />
          </div>

          {/* Header */}
          <div className="relative z-10 flex items-center space-x-3">
            <div className="w-12 h-12 bg-pink-600/20 rounded-full flex items-center justify-center text-pink-500 overflow-hidden border border-pink-500/20">
              {authorAvatar ? (
                <img src={authorAvatar} alt="Avatar" className="w-full h-full object-cover" />
              ) : (
                <User className="w-6 h-6" />
              )}
            </div>
            <div>
              <div className="flex items-center space-x-1">
                <p className={cn("font-bold text-base", authorProfile?.role === 'admin' ? "text-pink-400" : "text-zinc-100")}>
                  {authorNickname}
                </p>
              </div>
              <p className="text-[10px] uppercase tracking-widest font-black text-pink-500/80">
                {confession.category}
              </p>
            </div>
          </div>

          {/* Content */}
          <div className="relative z-10 flex-1 flex flex-col justify-center py-8">
            <div className="relative">
              <span className="absolute -top-10 -left-4 text-8xl font-serif text-pink-500/10 pointer-events-none">"</span>
              <p className="text-2xl font-medium text-zinc-100 leading-snug tracking-tight text-center italic">
                {confession.text}
              </p>
              <span className="absolute -bottom-16 -right-4 text-8xl font-serif text-pink-500/10 pointer-events-none rotate-180">"</span>
            </div>
            
            {confession.likes >= 10 && (
              <div className="mt-8 flex justify-center">
                <div className="flex items-center space-x-2 bg-orange-500/10 text-orange-500 px-3 py-1 rounded-full border border-orange-500/20">
                  <Flame className="w-4 h-4 fill-current" />
                  <span className="text-xs font-black uppercase tracking-tighter">Viralizando</span>
                </div>
              </div>
            )}
          </div>

          {/* Footer / Branding */}
          <div className="relative z-10 pt-8 border-t border-zinc-800/50 flex flex-col items-center">
            <div className="flex items-center space-x-2 mb-2">
              <div className="w-6 h-6 bg-pink-600 rounded-lg flex items-center justify-center">
                <Ghost className="w-4 h-4 text-white fill-white" />
              </div>
              <span className="text-sm font-black tracking-tighter text-zinc-100 uppercase italic">Confissões Anônimas</span>
            </div>
            <p className="text-[10px] text-zinc-500 font-medium uppercase tracking-widest">Conte o seu segredo também</p>
          </div>
        </div>

        {/* Actions */}
        <div className="w-full grid grid-cols-2 gap-4 mt-8">
          <button
            onClick={handleDownload}
            disabled={isExporting}
            className="flex items-center justify-center space-x-2 py-4 bg-zinc-800 hover:bg-zinc-700 text-zinc-100 rounded-2xl font-bold transition-all disabled:opacity-50"
          >
            <Download className="w-5 h-5" />
            <span>Baixar</span>
          </button>
          <button
            onClick={handleShare}
            disabled={isExporting}
            className="flex items-center justify-center space-x-2 py-4 bg-pink-600 hover:bg-pink-500 text-white rounded-2xl font-bold transition-all shadow-lg shadow-pink-600/20 disabled:opacity-50"
          >
            <Share2 className="w-5 h-5" />
            <span>Compartilhar</span>
          </button>
        </div>
        
        <p className="mt-4 text-xs text-zinc-500 text-center px-4">
          Dica: Poste nos seus Stories ou Status para atrair mais pessoas para o seu segredo!
        </p>
      </motion.div>
    </div>
  );
}
