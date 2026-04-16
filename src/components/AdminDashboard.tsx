import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, ShieldAlert, Trash2, UserX, CheckCircle, AlertTriangle, Ghost, Bell } from 'lucide-react';
import { db, auth, handleFirestoreError, OperationType } from '../firebase';
import { collection, query, where, getDocs, doc, updateDoc, deleteDoc, writeBatch, getDoc } from 'firebase/firestore';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface ReportData {
  id: string;
  confessionId: string;
  commentId?: string;
  reportedBy: string;
  reason: string;
  createdAt: any;
  status: string;
  type?: 'confession' | 'comment';
  confessionText?: string;
  commentText?: string;
  authorId?: string;
  authorNickname?: string;
  reporterNickname?: string;
}

interface AdminDashboardProps {
  onClose: () => void;
}

export default function AdminDashboard({ onClose }: AdminDashboardProps) {
  const [reports, setReports] = useState<ReportData[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<{
    type: 'delete_confession' | 'delete_comment' | 'ban_user' | 'shadow_ban';
    reportId: string;
    targetId: string;
    authorId?: string;
  } | null>(null);

  useEffect(() => {
    fetchReports();
  }, []);

  const fetchReports = async () => {
    setLoading(true);
    try {
      const q = query(collection(db, 'reports'), where('status', '==', 'pending'));
      const snap = await getDocs(q);
      
      const reportsData: ReportData[] = [];
      
      for (const document of snap.docs) {
        const report = { id: document.id, ...document.data() } as ReportData;
        
        // Fetch confession details
        const confessionSnap = await getDoc(doc(db, 'confessions', report.confessionId));
        if (confessionSnap.exists()) {
          const confessionData = confessionSnap.data();
          report.confessionText = confessionData.text;
          
          if (report.type === 'comment' && report.commentId) {
            const commentSnap = await getDoc(doc(db, 'comments', report.commentId));
            if (commentSnap.exists()) {
              const commentData = commentSnap.data();
              report.commentText = commentData.text;
              report.authorId = commentData.authorId;
            } else {
              report.commentText = '[Comentário já excluído]';
            }
          } else {
            report.authorId = confessionData.authorId;
          }
          
          // Fetch author details
          const targetAuthorId = report.authorId;
          if (targetAuthorId) {
            const userSnap = await getDoc(doc(db, 'users', targetAuthorId));
            if (userSnap.exists()) {
              report.authorNickname = userSnap.data().nickname;
            } else {
              report.authorNickname = 'Usuário Deletado';
            }
          }
        } else {
          report.confessionText = '[Confissão já excluída]';
        }

        // Fetch reporter details
        if (report.reportedBy) {
          const reporterSnap = await getDoc(doc(db, 'users', report.reportedBy));
          if (reporterSnap.exists()) {
            report.reporterNickname = reporterSnap.data().nickname;
          } else {
            report.reporterNickname = 'Usuário Deletado';
          }
        }
        
        reportsData.push(report);
      }
      
      // Sort by newest first
      reportsData.sort((a, b) => {
        const timeA = a.createdAt?.toDate?.()?.getTime() || 0;
        const timeB = b.createdAt?.toDate?.()?.getTime() || 0;
        return timeB - timeA;
      });
      
      setReports(reportsData);
    } catch (error) {
      console.error("Erro ao buscar denúncias:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleIgnore = async (reportId: string) => {
    setActionLoading(reportId);
    try {
      await updateDoc(doc(db, 'reports', reportId), { status: 'ignored' });
      setReports(prev => prev.filter(r => r.id !== reportId));
    } catch (error) {
      console.error("Erro ao ignorar denúncia:", error);
      alert("Erro ao ignorar denúncia.");
    } finally {
      setActionLoading(null);
    }
  };

  const handleDeleteConfession = async (reportId: string, confessionId: string) => {
    setActionLoading(reportId);
    try {
      const batch = writeBatch(db);
      batch.delete(doc(db, 'confessions', confessionId));
      batch.update(doc(db, 'reports', reportId), { status: 'resolved' });
      await batch.commit();
      setReports(prev => prev.filter(r => r.id !== reportId));
    } catch (error) {
      console.error("Erro ao excluir confissão:", error);
      alert("Erro ao excluir confissão.");
    } finally {
      setActionLoading(null);
      setConfirmAction(null);
    }
  };

  const handleDeleteComment = async (reportId: string, commentId: string) => {
    setActionLoading(reportId);
    try {
      const batch = writeBatch(db);
      batch.delete(doc(db, 'comments', commentId));
      batch.update(doc(db, 'reports', reportId), { status: 'resolved' });
      await batch.commit();
      setReports(prev => prev.filter(r => r.id !== reportId));
    } catch (error) {
      console.error("Erro ao excluir comentário:", error);
      alert("Erro ao excluir comentário.");
    } finally {
      setActionLoading(null);
      setConfirmAction(null);
    }
  };

  const handleShadowBan = async (reportId: string, authorId: string) => {
    setActionLoading(reportId);
    try {
      await updateDoc(doc(db, 'users', authorId), { isShadowBanned: true });
      await updateDoc(doc(db, 'reports', reportId), { status: 'resolved' });
      setReports(prev => prev.filter(r => r.id !== reportId));
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `users/${authorId}`);
    } finally {
      setActionLoading(null);
      setConfirmAction(null);
    }
  };

  const handleBanUser = async (reportId: string, targetId: string, authorId: string, isComment: boolean) => {
    setActionLoading(reportId);
    try {
      if (authorId) {
        // Delete user profile
        await writeBatch(db).delete(doc(db, 'users', authorId)).commit();
        
        // Fetch all confessions by this user
        const confessionsQuery = query(collection(db, 'confessions'), where('authorId', '==', authorId));
        const confessionsSnap = await getDocs(confessionsQuery);
        
        // Fetch all comments by this user
        const commentsQuery = query(collection(db, 'comments'), where('authorId', '==', authorId));
        const commentsSnap = await getDocs(commentsQuery);

        const allDocsToDelete = [
          ...confessionsSnap.docs,
          ...commentsSnap.docs
        ];

        // Delete in chunks of 450 (to be safe with the 500 limit)
        for (let i = 0; i < allDocsToDelete.length; i += 450) {
          const batch = writeBatch(db);
          const chunk = allDocsToDelete.slice(i, i + 450);
          chunk.forEach(d => batch.delete(d.ref));
          await batch.commit();
        }
      } else {
        // If no authorId, just delete the target
        const batch = writeBatch(db);
        if (isComment) {
          batch.delete(doc(db, 'comments', targetId));
        } else {
          batch.delete(doc(db, 'confessions', targetId));
        }
        await batch.commit();
      }

      await updateDoc(doc(db, 'reports', reportId), { status: 'resolved' });
      setReports(prev => prev.filter(r => r.id !== reportId));
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `reports/${reportId}`);
    } finally {
      setActionLoading(null);
      setConfirmAction(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[85vh]"
      >
        <div className="p-5 border-b border-zinc-800 flex items-center justify-between bg-zinc-950">
          <div className="flex items-center space-x-3">
            <div className="bg-red-500/20 p-2 rounded-lg">
              <ShieldAlert className="w-6 h-6 text-red-500" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-zinc-100">Painel de Administração</h2>
              <p className="text-xs text-zinc-400">Gerenciamento de denúncias</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 rounded-full transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto custom-scrollbar flex-1 bg-zinc-950/50">
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 shadow-lg mb-6">
              <h3 className="text-sm font-bold text-zinc-100 mb-3 flex items-center space-x-2">
                <Bell className="w-4 h-4 text-pink-500" />
                <span>Testar Notificações Push</span>
              </h3>
              <div className="mb-4 p-3 bg-zinc-950 rounded-lg border border-zinc-800/50">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-zinc-400">Status de Permissão:</span>
                  <span className={`text-xs font-bold ${
                    typeof window !== 'undefined' && 'Notification' in window 
                      ? Notification.permission === 'granted' ? 'text-green-500' : Notification.permission === 'denied' ? 'text-red-500' : 'text-yellow-500'
                      : 'text-zinc-500'
                  }`}>
                    {typeof window !== 'undefined' && 'Notification' in window 
                      ? Notification.permission === 'granted' ? 'Ativado' : Notification.permission === 'denied' ? 'Bloqueado' : 'Pendente'
                      : 'Não suportado'}
                  </span>
                </div>
                {typeof window !== 'undefined' && 'Notification' in window && Notification.permission !== 'granted' && (
                  <button
                    onClick={async () => {
                      const permission = await Notification.requestPermission();
                      if (permission === 'granted') {
                        alert("Permissão concedida! Agora você pode receber notificações.");
                        window.location.reload();
                      } else {
                        alert("Permissão negada. Você precisa ativar nas configurações do navegador.");
                      }
                    }}
                    className="w-full py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-xs font-medium transition-colors border border-zinc-700"
                  >
                    Solicitar Permissão
                  </button>
                )}
              </div>
              <p className="text-xs text-zinc-400 mb-4">Envie uma notificação de teste para você mesmo para verificar se o sistema está funcionando.</p>
              <button
                onClick={async () => {
                  try {
                    const res = await fetch('/api/notify', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        userId: auth.currentUser?.uid,
                        title: '🔔 Teste de Notificação',
                        body: 'Se você está vendo isso, as notificações push estão funcionando perfeitamente!',
                        data: { type: 'test' }
                      })
                    });
                    const data = await res.json();
                    if (data.success) {
                      alert("Notificação enviada com sucesso! Verifique seu dispositivo.");
                    } else {
                      alert("Erro ao enviar: " + data.error);
                    }
                  } catch (err: any) {
                    alert("Erro na requisição: " + err.message);
                  }
                }}
                className="w-full py-2.5 bg-pink-600/10 hover:bg-pink-600/20 text-pink-500 border border-pink-500/20 rounded-xl text-xs font-bold transition-all"
              >
                Enviar Notificação de Teste
              </button>
            </div>

            {loading ? (
            <div className="flex flex-col items-center justify-center py-12">
              <div className="w-8 h-8 border-4 border-pink-500/30 border-t-pink-500 rounded-full animate-spin mb-4"></div>
              <p className="text-zinc-400">Buscando denúncias...</p>
            </div>
          ) : reports.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <CheckCircle className="w-16 h-16 text-green-500/50 mb-4" />
              <h3 className="text-lg font-medium text-zinc-300">Tudo limpo por aqui!</h3>
              <p className="text-zinc-500 mt-1">Não há denúncias pendentes no momento.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {reports.map((report) => (
                <div key={report.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 shadow-lg">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center space-x-2">
                      <AlertTriangle className="w-4 h-4 text-yellow-500" />
                      <span className="text-sm font-bold text-yellow-500">
                        {report.type === 'comment' ? 'Comentário: ' : 'Confissão: '}
                        {report.reason}
                      </span>
                    </div>
                    <span className="text-xs text-zinc-500">
                      {report.createdAt?.toDate ? formatDistanceToNow(report.createdAt.toDate(), { addSuffix: true, locale: ptBR }) : 'agora'}
                    </span>
                  </div>
                  
                  <div className="bg-zinc-950 p-4 rounded-lg border border-zinc-800/50 mb-4">
                    {report.type === 'comment' ? (
                      <>
                        <p className="text-sm text-zinc-300 italic mb-2">Comentário: "{report.commentText}"</p>
                        <p className="text-xs text-zinc-500">Na confissão: "{report.confessionText}"</p>
                      </>
                    ) : (
                      <p className="text-sm text-zinc-300 italic">"{report.confessionText}"</p>
                    )}
                    <div className="flex justify-between items-center mt-3 pt-3 border-t border-zinc-800/50">
                      <p className="text-xs text-zinc-500">
                        <span className="font-medium text-zinc-400">Denunciado por:</span> {report.reporterNickname || 'Desconhecido'}
                      </p>
                      <p className="text-xs text-zinc-500">
                        <span className="font-medium text-zinc-400">Autor:</span> {report.authorNickname || 'Desconhecido'}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 justify-end pt-2 border-t border-zinc-800/50">
                    <button
                      onClick={() => handleIgnore(report.id)}
                      disabled={actionLoading === report.id}
                      className="px-4 py-2 rounded-lg text-sm font-medium text-zinc-400 bg-zinc-800 hover:bg-zinc-700 hover:text-zinc-200 transition-colors disabled:opacity-50"
                    >
                      Ignorar Denúncia
                    </button>
                    
                    {(report.type === 'comment' ? report.commentText !== '[Comentário já excluído]' : report.confessionText !== '[Confissão já excluída]') && (
                      <>
                        <button
                          onClick={() => {
                            if (report.type === 'comment') {
                              setConfirmAction({ type: 'delete_comment', reportId: report.id, targetId: report.commentId! });
                            } else {
                              setConfirmAction({ type: 'delete_confession', reportId: report.id, targetId: report.confessionId });
                            }
                          }}
                          disabled={actionLoading === report.id}
                          className="px-4 py-2 rounded-lg text-sm font-medium text-orange-400 bg-orange-500/10 hover:bg-orange-500/20 border border-orange-500/20 transition-colors flex items-center space-x-2 disabled:opacity-50"
                        >
                          <Trash2 className="w-4 h-4" />
                          <span>Excluir {report.type === 'comment' ? 'Comentário' : 'Confissão'}</span>
                        </button>
                        
                        {report.authorId && (
                          <button
                            onClick={() => setConfirmAction({ 
                              type: 'ban_user', 
                              reportId: report.id, 
                              targetId: report.type === 'comment' ? report.commentId! : report.confessionId,
                              authorId: report.authorId
                            })}
                            disabled={actionLoading === report.id}
                            className="px-4 py-2 rounded-lg text-sm font-medium text-red-400 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 transition-colors flex items-center space-x-2 disabled:opacity-50"
                          >
                            <UserX className="w-4 h-4" />
                            <span>Banir Usuário</span>
                          </button>
                        )}

                        {report.authorId && (
                          <button
                            onClick={() => setConfirmAction({ 
                              type: 'shadow_ban', 
                              reportId: report.id, 
                              targetId: report.type === 'comment' ? report.commentId! : report.confessionId,
                              authorId: report.authorId
                            })}
                            disabled={actionLoading === report.id}
                            className="px-4 py-2 rounded-lg text-sm font-medium text-purple-400 bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/20 transition-colors flex items-center space-x-2 disabled:opacity-50"
                          >
                            <Ghost className="w-4 h-4" />
                            <span>Shadow Ban</span>
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Custom Confirmation Modal */}
        <AnimatePresence>
          {confirmAction && (
            <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 w-full max-w-sm shadow-2xl"
              >
                <h3 className="text-lg font-bold text-zinc-100 mb-2">Confirmar Ação</h3>
                <p className="text-sm text-zinc-400 mb-6">
                  {confirmAction.type === 'ban_user' 
                    ? "Tem certeza que deseja BANIR este usuário e excluir o conteúdo?" 
                    : confirmAction.type === 'shadow_ban'
                    ? "Shadow Ban: O usuário continuará postando, mas NINGUÉM verá o conteúdo dele. Deseja prosseguir?"
                    : `Tem certeza que deseja excluir este ${confirmAction.type === 'delete_comment' ? 'comentário' : 'confissão'}?`}
                </p>
                
                <div className="flex items-center space-x-3">
                  <button
                    onClick={() => setConfirmAction(null)}
                    className="flex-1 py-3 rounded-xl text-sm font-bold text-zinc-400 bg-zinc-800 hover:bg-zinc-700 transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={() => {
                      if (confirmAction.type === 'delete_confession') {
                        handleDeleteConfession(confirmAction.reportId, confirmAction.targetId);
                      } else if (confirmAction.type === 'delete_comment') {
                        handleDeleteComment(confirmAction.reportId, confirmAction.targetId);
                      } else if (confirmAction.type === 'ban_user') {
                        handleBanUser(confirmAction.reportId, confirmAction.targetId, confirmAction.authorId!, reports.find(r => r.id === confirmAction.reportId)?.type === 'comment');
                      } else if (confirmAction.type === 'shadow_ban') {
                        handleShadowBan(confirmAction.reportId, confirmAction.authorId!);
                      }
                    }}
                    className="flex-1 py-3 rounded-xl text-sm font-bold text-white bg-red-600 hover:bg-red-700 transition-colors"
                  >
                    Confirmar
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
