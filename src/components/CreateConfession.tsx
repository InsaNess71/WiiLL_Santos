import React, { useState } from 'react';
import { CATEGORIES } from '../types';
import { addDoc, collection, serverTimestamp, getDoc, doc } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { db, auth, storage, handleFirestoreError, OperationType } from '../firebase';
import { Send, X, ShieldAlert, Camera, Crown, Trash2, Upload, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { containsProfanity, filterProfanity } from '../lib/filter';
import { moderateConfession } from '../services/geminiService';
import { cn } from '../lib/utils';
import PremiumModal from './PremiumModal';

interface CreateConfessionProps {
  onClose: () => void;
  isPremium: boolean;
}

export default function CreateConfession({ onClose, isPremium }: CreateConfessionProps) {
  const [text, setText] = useState('');
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [age, setAge] = useState('');
  const [gender, setGender] = useState('');
  const [background, setBackground] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [showPremiumModal, setShowPremiumModal] = useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const BACKGROUNDS = [
    { name: 'Padrão', value: '' },
    { name: 'Rosa', value: 'bg-gradient-to-br from-pink-600 to-rose-800' },
    { name: 'Roxo', value: 'bg-gradient-to-br from-purple-600 to-indigo-800' },
    { name: 'Azul', value: 'bg-gradient-to-br from-blue-600 to-cyan-800' },
    { name: 'Verde', value: 'bg-gradient-to-br from-emerald-600 to-teal-800' },
    { name: 'Laranja', value: 'bg-gradient-to-br from-orange-500 to-red-700' },
    { name: 'Noite', value: 'bg-gradient-to-br from-zinc-800 to-black' },
    { name: 'Galáxia', value: 'bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-900' },
  ];
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim() || !auth.currentUser || isUploading) return;

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
      
      // 3. Check if user is shadow banned
      const userDoc = await getDoc(doc(db, 'users', auth.currentUser.uid));
      const isShadowBanned = userDoc.exists() && userDoc.data().isShadowBanned === true;
      
      const confessionData: any = {
        text: filteredText,
        category,
        likes: 0,
        commentCount: 0,
        judgement: { right: 0, wrong: 0 },
        background,
        imageUrl: isPremium ? imageUrl : '',
        isHidden: isShadowBanned,
        createdAt: serverTimestamp(),
        authorId: auth.currentUser.uid
      };

      if (age) confessionData.age = parseInt(age);
      if (gender) confessionData.gender = gender;

      await addDoc(collection(db, 'confessions'), confessionData);
      onClose();
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'confessions');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !auth.currentUser) return;

    if (!isPremium) {
      setShowPremiumModal(true);
      return;
    }

    if (!auth.currentUser) {
      setError('Você precisa estar logado para enviar fotos.');
      return;
    }

    // Check file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      setError('A imagem deve ter no máximo 5MB.');
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);
    setError('');

    try {
      const fileName = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.]/g, '_')}`;
      const storageRef = ref(storage, `confessions/${auth.currentUser.uid}/${fileName}`);
      
      console.log("Starting upload to:", storageRef.fullPath);
      const uploadTask = uploadBytesResumable(storageRef, file);

      uploadTask.on('state_changed', 
        (snapshot) => {
          const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
          setUploadProgress(progress);
          console.log(`Upload progress: ${progress}%`);
        }, 
        (error) => {
          console.error("Detailed upload error:", error);
          let errorMessage = 'Erro ao enviar imagem.';
          if (error.code === 'storage/unauthorized') {
            errorMessage = 'Erro de permissão (403). Verifique se o Storage está ativado e as regras de segurança foram publicadas.';
          } else if (error.code === 'storage/project-not-found') {
            errorMessage = 'Projeto não encontrado. Verifique a configuração do Firebase.';
          } else if (error.code === 'storage/quota-exceeded') {
            errorMessage = 'Limite de armazenamento excedido.';
          } else if (error.code === 'storage/retry-limit-exceeded') {
            errorMessage = 'Tempo limite excedido. Verifique sua conexão.';
          } else {
            errorMessage = `Erro (${error.code}): ${error.message}`;
          }
          setError(errorMessage);
          setIsUploading(false);
        }, 
        async () => {
          try {
            const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
            setImageUrl(downloadURL);
            setIsUploading(false);
            setUploadProgress(100);
          } catch (err: any) {
            console.error("Error getting download URL:", err);
            setError('Erro ao obter link da imagem: ' + err.message);
            setIsUploading(false);
          }
        }
      );
    } catch (err: any) {
      console.error("Error starting upload task:", err);
      setError('Erro ao iniciar upload: ' + err.message);
      setIsUploading(false);
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

          <div>
            <label className="block text-sm font-medium text-zinc-400 mb-2">Estilo do Card</label>
            <div className="flex flex-wrap gap-2">
              {BACKGROUNDS.map((bg) => (
                <button
                  key={bg.name}
                  type="button"
                  onClick={() => setBackground(bg.value)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${
                    background === bg.value 
                      ? 'border-pink-500 bg-pink-500/20 text-pink-100' 
                      : 'border-zinc-800 bg-zinc-950 text-zinc-400 hover:border-zinc-700'
                  }`}
                >
                  {bg.name}
                </button>
              ))}
            </div>
          </div>

          <div className="pt-2">
            <label className="block text-sm font-medium text-zinc-400 mb-2 flex items-center justify-between">
              <span className="flex items-center space-x-1.5">
                <Camera className="w-4 h-4" />
                <span>Imagem (Premium)</span>
              </span>
              {!isPremium && (
                <span className="flex items-center space-x-1 text-[10px] bg-yellow-500/10 text-yellow-500 px-1.5 py-0.5 rounded uppercase font-bold">
                  <Crown className="w-3 h-3" />
                  <span>Bloqueado</span>
                </span>
              )}
            </label>
            
            {isPremium ? (
              <div className="space-y-3">
                <input 
                  type="file" 
                  ref={fileInputRef}
                  onChange={handleFileUpload}
                  accept="image/*"
                  className="hidden"
                />
                
                {imageUrl ? (
                  <div className="relative rounded-xl overflow-hidden border border-zinc-800 bg-black aspect-video">
                    <img src={imageUrl} alt="Preview" className="w-full h-full object-contain" />
                    <button
                      type="button"
                      onClick={() => setImageUrl('')}
                      className="absolute top-2 right-2 p-1.5 bg-black/60 text-white rounded-full hover:bg-red-500 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ) : isUploading ? (
                  <div className="w-full py-8 bg-zinc-950 border border-zinc-800 rounded-xl flex flex-col items-center justify-center space-y-3">
                    <Loader2 className="w-6 h-6 text-pink-500 animate-spin" />
                    <div className="w-1/2 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-pink-600 transition-all duration-300" 
                        style={{ width: `${uploadProgress}%` }}
                      />
                    </div>
                    <span className="text-xs text-zinc-500">Enviando imagem... {Math.round(uploadProgress)}%</span>
                  </div>
                ) : (
                  <div className="flex space-x-2">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="flex-1 py-3 bg-zinc-950 border border-zinc-800 rounded-lg flex items-center justify-center space-x-2 text-zinc-300 hover:bg-zinc-800 transition-colors"
                    >
                      <Upload className="w-4 h-4" />
                      <span className="text-sm">Enviar do Aparelho</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setImageUrl('https://picsum.photos/seed/' + Math.random() + '/800/600')}
                      className="px-4 py-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-xs font-medium transition-colors"
                    >
                      Aleatória
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowPremiumModal(true)}
                className="w-full py-4 bg-zinc-950 border-2 border-dashed border-zinc-800 rounded-xl flex flex-col items-center justify-center space-y-2 text-zinc-500 hover:border-zinc-700 hover:text-zinc-400 transition-all group"
              >
                <Camera className="w-6 h-6 group-hover:scale-110 transition-transform" />
                <span className="text-xs font-medium">Torne-se Premium para postar fotos</span>
              </button>
            )}
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
      {showPremiumModal && <PremiumModal onClose={() => setShowPremiumModal(false)} />}
    </div>
  );
}
