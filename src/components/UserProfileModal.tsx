import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { X, MessageSquare, User, Edit2, Save, FileText, Shield, LogOut } from 'lucide-react';
import { db, auth, logOut } from '../firebase';
import { doc, getDoc, collection, query, where, getDocs, updateDoc } from 'firebase/firestore';
import { Confession, UserProfile, AVATARS } from '../types';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import PrivacyPolicy from './PrivacyPolicy';
import TermsOfUse from './TermsOfUse';

interface UserProfileModalProps {
  userId: string;
  onClose: () => void;
}

export default function UserProfileModal({ userId, onClose }: UserProfileModalProps) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [confessions, setConfessions] = useState<Confession[]>([]);
  const [loading, setLoading] = useState(true);
  const [startingChat, setStartingChat] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  
  // Edit mode state
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    nickname: '',
    gender: '',
    maritalStatus: '',
    bio: '',
    avatar: ''
  });
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const userDoc = await getDoc(doc(db, 'users', userId));
        if (userDoc.exists()) {
          const data = userDoc.data() as UserProfile;
          setProfile(data);
          setEditForm({
            nickname: data.nickname || '',
            gender: data.gender || '',
            maritalStatus: data.maritalStatus || '',
            bio: data.bio || '',
            avatar: data.avatar || ''
          });
        }

        const q = query(
          collection(db, 'confessions'),
          where('authorId', '==', userId)
        );
        const snap = await getDocs(q);
        const userConfessions = snap.docs.map(d => ({ id: d.id, ...d.data() } as Confession));
        
        userConfessions.sort((a, b) => {
          const timeA = a.createdAt?.toDate?.()?.getTime() || 0;
          const timeB = b.createdAt?.toDate?.()?.getTime() || 0;
          return timeB - timeA;
        });
        
        setConfessions(userConfessions);
      } catch (error) {
        console.error("Error fetching profile:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchProfile();
  }, [userId]);

  const handleStartChat = async () => {
    if (!auth.currentUser || startingChat || auth.currentUser.uid === userId) return;
    setStartingChat(true);

    try {
      const uids = [auth.currentUser.uid, userId].sort();
      const chatId = `${uids[0]}_${uids[1]}`;
      
      window.dispatchEvent(new CustomEvent('openChat', { detail: { chatId } }));
      onClose();
    } catch (error) {
      console.error("Error starting chat:", error);
      alert('Erro ao iniciar chat.');
    } finally {
      setStartingChat(false);
    }
  };

  const handleSaveProfile = async () => {
    if (!auth.currentUser || auth.currentUser.uid !== userId) return;
    
    if (editForm.nickname.length < 3 || editForm.nickname.length > 20) {
      setError('O apelido deve ter entre 3 e 20 caracteres.');
      return;
    }

    setIsSaving(true);
    setError('');

    try {
      const updateData: any = {
        nickname: editForm.nickname.trim(),
      };
      
      if (editForm.gender) updateData.gender = editForm.gender.trim();
      if (editForm.maritalStatus) updateData.maritalStatus = editForm.maritalStatus.trim();
      if (editForm.bio) updateData.bio = editForm.bio.trim();
      if (editForm.avatar) updateData.avatar = editForm.avatar;

      await updateDoc(doc(db, 'users', userId), updateData);
      
      setProfile(prev => prev ? { ...prev, ...updateData } : null);
      setIsEditing(false);
    } catch (err) {
      console.error("Error updating profile:", err);
      setError('Erro ao salvar o perfil. Tente novamente.');
    } finally {
      setIsSaving(false);
    }
  };

  const isMe = auth.currentUser?.uid === userId;
  const nickname = profile?.nickname || 'Usuário Anônimo';

  let statusText = '';
  let isOnline = false;

  if (profile?.lastActive?.toDate) {
    const lastActiveDate = profile.lastActive.toDate();
    const now = new Date();
    const diffMs = now.getTime() - lastActiveDate.getTime();
    
    if (diffMs < 3 * 60 * 1000) {
      isOnline = true;
      statusText = 'Online agora';
    } else {
      statusText = `Visto por último ${formatDistanceToNow(lastActiveDate, { addSuffix: true, locale: ptBR })}`;
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl flex flex-col max-h-[85vh]"
      >
        <div className="p-6 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/50">
          <div className="flex items-center space-x-4">
            <div className="w-14 h-14 bg-pink-600/20 rounded-full flex items-center justify-center text-pink-500 relative shrink-0 overflow-hidden">
              {profile?.avatar ? (
                <img src={profile.avatar} alt="Avatar" className="w-full h-full object-cover" />
              ) : (
                <User className="w-7 h-7" />
              )}
              {isOnline && !isEditing && (
                <span className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-green-500 border-2 border-zinc-900 rounded-full"></span>
              )}
            </div>
            <div className="flex-1">
              {isEditing ? (
                <input
                  type="text"
                  value={editForm.nickname}
                  onChange={(e) => setEditForm({ ...editForm, nickname: e.target.value })}
                  className="w-full bg-zinc-950 border border-zinc-700 rounded-md px-3 py-1.5 text-zinc-100 text-lg font-bold focus:outline-none focus:border-pink-500/50"
                  placeholder="Seu apelido"
                  maxLength={20}
                />
              ) : (
                <>
                  <h2 className="text-xl font-bold text-zinc-100">{nickname}</h2>
                  <div className="flex items-center space-x-2 mt-0.5">
                    <p className="text-sm text-zinc-500">{confessions.length} confissões</p>
                    {statusText && (
                      <>
                        <span className="text-zinc-700">•</span>
                        <p className="text-xs text-zinc-400">{statusText}</p>
                      </>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
          <div className="flex items-center space-x-2 ml-4">
            {isMe && !isEditing && (
              <button 
                onClick={() => setIsEditing(true)}
                className="p-2 text-zinc-400 hover:text-pink-400 hover:bg-zinc-800 rounded-full transition-colors"
                title="Editar Perfil"
              >
                <Edit2 className="w-4 h-4" />
              </button>
            )}
            <button 
              onClick={onClose}
              className="p-2 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 rounded-full transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="p-6 overflow-y-auto custom-scrollbar flex-1">
          {error && (
            <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-sm text-red-400">
              {error}
            </div>
          )}

          {isEditing ? (
            <div className="space-y-5 mb-6">
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-2">Escolha seu Avatar</label>
                <div className="grid grid-cols-4 gap-2">
                  {AVATARS.map((avatarUrl, idx) => (
                    <button
                      key={idx}
                      onClick={() => setEditForm({ ...editForm, avatar: avatarUrl })}
                      className={`relative rounded-full overflow-hidden border-2 transition-all ${editForm.avatar === avatarUrl ? 'border-pink-500 scale-110 shadow-lg shadow-pink-500/20' : 'border-transparent hover:border-zinc-700 bg-zinc-800/50'}`}
                    >
                      <img src={avatarUrl} alt={`Avatar ${idx}`} className="w-full h-auto" />
                    </button>
                  ))}
                </div>
              </div>
              
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1.5">Gênero</label>
                <select
                  value={editForm.gender}
                  onChange={(e) => setEditForm({ ...editForm, gender: e.target.value })}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-sm text-zinc-100 focus:outline-none focus:border-pink-500/50"
                >
                  <option value="">Prefiro não dizer</option>
                  <option value="Mulher">Mulher</option>
                  <option value="Homem">Homem</option>
                  <option value="Não-binário">Não-binário</option>
                  <option value="Outro">Outro</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1.5">Estado Civil</label>
                <select
                  value={editForm.maritalStatus}
                  onChange={(e) => setEditForm({ ...editForm, maritalStatus: e.target.value })}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-sm text-zinc-100 focus:outline-none focus:border-pink-500/50"
                >
                  <option value="">Prefiro não dizer</option>
                  <option value="Solteiro(a)">Solteiro(a)</option>
                  <option value="Namorando">Namorando</option>
                  <option value="Casado(a)">Casado(a)</option>
                  <option value="Divorciado(a)">Divorciado(a)</option>
                  <option value="Viúvo(a)">Viúvo(a)</option>
                  <option value="Enrolado(a)">Enrolado(a)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1.5">Biografia</label>
                <textarea
                  value={editForm.bio}
                  onChange={(e) => setEditForm({ ...editForm, bio: e.target.value })}
                  placeholder="Conte um pouco sobre você..."
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-3 text-sm text-zinc-100 focus:outline-none focus:border-pink-500/50 resize-none h-24"
                  maxLength={500}
                />
              </div>
              <div className="flex space-x-3 pt-2">
                <button
                  onClick={() => setIsEditing(false)}
                  className="flex-1 py-2 rounded-lg font-medium text-zinc-300 bg-zinc-800 hover:bg-zinc-700 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSaveProfile}
                  disabled={isSaving}
                  className="flex-1 py-2 rounded-lg font-medium text-white bg-pink-600 hover:bg-pink-500 transition-colors flex items-center justify-center space-x-2 disabled:opacity-50"
                >
                  <Save className="w-4 h-4" />
                  <span>{isSaving ? 'Salvando...' : 'Salvar'}</span>
                </button>
              </div>
            </div>
          ) : (
            <>
              {(profile?.bio || profile?.gender || profile?.maritalStatus) && (
                <div className="mb-6 space-y-4">
                  {profile.bio && (
                    <div className="bg-zinc-950/50 p-4 rounded-xl border border-zinc-800/50">
                      <p className="text-sm text-zinc-300 italic">"{profile.bio}"</p>
                    </div>
                  )}
                  
                  {(profile.gender || profile.maritalStatus) && (
                    <div className="flex flex-wrap gap-2">
                      {profile.gender && (
                        <span className="px-3 py-1 bg-zinc-800 text-zinc-300 text-xs rounded-full border border-zinc-700">
                          {profile.gender}
                        </span>
                      )}
                      {profile.maritalStatus && (
                        <span className="px-3 py-1 bg-zinc-800 text-zinc-300 text-xs rounded-full border border-zinc-700">
                          {profile.maritalStatus}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              )}

              {!isMe && auth.currentUser && (
                <button
                  onClick={handleStartChat}
                  disabled={startingChat}
                  className="w-full mb-6 flex items-center justify-center space-x-2 bg-pink-600 hover:bg-pink-500 text-white py-3 px-4 rounded-xl font-medium transition-colors disabled:opacity-50"
                >
                  <MessageSquare className="w-5 h-5" />
                  <span>{startingChat ? 'Iniciando...' : 'Chamar no Bate-papo'}</span>
                </button>
              )}

              <h3 className="text-sm font-medium text-zinc-400 mb-4 uppercase tracking-wider">Confissões de {nickname}</h3>
              
              {loading ? (
                <div className="text-center py-8 text-zinc-500">Carregando...</div>
              ) : confessions.length === 0 ? (
                <div className="text-center py-8 text-zinc-500">Nenhuma confissão ainda.</div>
              ) : (
                <div className="space-y-4 mb-8">
                  {confessions.map(conf => (
                    <div key={conf.id} className="bg-zinc-950 p-4 rounded-xl border border-zinc-800/50">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-medium text-pink-500">{conf.category}</span>
                        <span className="text-xs text-zinc-600">
                          {conf.createdAt?.toDate ? formatDistanceToNow(conf.createdAt.toDate(), { addSuffix: true, locale: ptBR }) : 'agora'}
                        </span>
                      </div>
                      <p className="text-sm text-zinc-300">"{conf.text}"</p>
                    </div>
                  ))}
                </div>
              )}

              {isMe && (
                <div className="border-t border-zinc-800 pt-6 mt-6 space-y-3">
                  <button 
                    onClick={() => setShowTerms(true)}
                    className="w-full flex items-center justify-between p-3 rounded-xl bg-zinc-950 border border-zinc-800 hover:bg-zinc-800 transition-colors text-zinc-300"
                  >
                    <div className="flex items-center space-x-3">
                      <FileText className="w-5 h-5 text-zinc-500" />
                      <span className="text-sm font-medium">Termos de Uso</span>
                    </div>
                  </button>
                  <button 
                    onClick={() => setShowPrivacy(true)}
                    className="w-full flex items-center justify-between p-3 rounded-xl bg-zinc-950 border border-zinc-800 hover:bg-zinc-800 transition-colors text-zinc-300"
                  >
                    <div className="flex items-center space-x-3">
                      <Shield className="w-5 h-5 text-zinc-500" />
                      <span className="text-sm font-medium">Política de Privacidade</span>
                    </div>
                  </button>
                  <button 
                    onClick={() => {
                      onClose();
                      logOut();
                    }}
                    className="w-full flex items-center justify-between p-3 rounded-xl bg-red-500/10 border border-red-500/20 hover:bg-red-500/20 transition-colors text-red-400 mt-4"
                  >
                    <div className="flex items-center space-x-3">
                      <LogOut className="w-5 h-5" />
                      <span className="text-sm font-medium">Sair da Conta</span>
                    </div>
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </motion.div>

      {showPrivacy && <PrivacyPolicy onClose={() => setShowPrivacy(false)} />}
      {showTerms && <TermsOfUse onClose={() => setShowTerms(false)} />}
    </div>
  );
}
