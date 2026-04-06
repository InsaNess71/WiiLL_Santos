import React, { useState, useEffect } from 'react';
import { X, Share, MoreVertical } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export default function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [deviceType, setDeviceType] = useState<'ios' | 'android' | 'desktop'>('desktop');
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    // Verifica se já está instalado (standalone mode)
    const isAppMode = window.matchMedia('(display-mode: standalone)').matches || 
                      (window.navigator as any).standalone === true;
    setIsStandalone(isAppMode);

    if (isAppMode) return;

    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIos = /iphone|ipad|ipod/.test(userAgent);
    const isAndroid = /android/.test(userAgent);
    
    if (isIos) setDeviceType('ios');
    else if (isAndroid) setDeviceType('android');

    let promptFired = false;

    // Para Android/Chrome, interceptamos o evento nativo de instalação
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault(); // Impede que o mini-infobar padrão do Chrome apareça
      promptFired = true;
      setDeferredPrompt(e); // Guarda o evento para usarmos no botão
      setShowPrompt(true); // Mostra nosso banner customizado
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    // Ouve quando o app for instalado com sucesso para esconder o banner
    const handleAppInstalled = () => {
      setShowPrompt(false);
      setDeferredPrompt(null);
    };

    window.addEventListener('appinstalled', handleAppInstalled);

    // Fallback: se for celular e o evento nativo não disparar em 2.5 segundos, mostra instrução manual
    const timer = setTimeout(() => {
      if (!promptFired && (isIos || isAndroid)) {
        setShowPrompt(true);
      }
    }, 2500);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
      clearTimeout(timer);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    
    // Mostra o prompt nativo de instalação
    deferredPrompt.prompt();
    
    // Aguarda a resposta do usuário
    const { outcome } = await deferredPrompt.userChoice;
    
    if (outcome === 'accepted') {
      setShowPrompt(false);
    }
    
    // O prompt só pode ser usado uma vez
    setDeferredPrompt(null);
  };

  // Se já estiver instalado, não for para mostrar, ou for desktop, não renderiza nada
  if (isStandalone || !showPrompt || deviceType === 'desktop') return null;

  return (
    <AnimatePresence>
      {showPrompt && (
        <motion.div 
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          className="fixed bottom-4 left-4 right-4 z-50 bg-pink-600 text-white p-4 rounded-2xl shadow-2xl flex items-center justify-between border border-pink-500/50"
        >
          <div className="flex-1 pr-4">
            <h3 className="font-bold text-sm mb-1">Instale o App</h3>
            {deviceType === 'ios' ? (
              <p className="text-xs text-pink-100 leading-relaxed">
                Toque em <Share className="inline w-3 h-3 mx-0.5" /> Compartilhar e depois em <strong>"Adicionar à Tela de Início"</strong>.
              </p>
            ) : deferredPrompt ? (
              <p className="text-xs text-pink-100">
                Instale o Confissões para uma experiência mais rápida e imersiva.
              </p>
            ) : (
              <p className="text-xs text-pink-100 leading-relaxed">
                Toque nos <MoreVertical className="inline w-3 h-3 mx-0.5" /> 3 pontinhos do Chrome e em <strong>"Adicionar à Tela Inicial"</strong>.
              </p>
            )}
          </div>
          
          <div className="flex items-center space-x-3 shrink-0">
            {deviceType === 'android' && deferredPrompt && (
              <button 
                onClick={handleInstallClick}
                className="bg-white text-pink-600 px-4 py-2 rounded-full text-sm font-bold shadow-sm hover:bg-zinc-100 transition-colors"
              >
                Instalar
              </button>
            )}
            <button 
              onClick={() => setShowPrompt(false)}
              className="p-2 bg-pink-700/50 rounded-full hover:bg-pink-700 transition-colors"
              aria-label="Fechar"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
