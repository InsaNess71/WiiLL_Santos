import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { X, ShieldAlert, Trash2, UserX, CheckCircle, AlertTriangle } from 'lucide-react';
import { db } from '../firebase';
import { collection, query, where, getDocs, doc, updateDoc, deleteDoc, writeBatch, getDoc } from 'firebase/firestore';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface ReportData {
  id: string;
  confessionId: string;
  reportedBy: string;
  reason: string;
  createdAt: any;
  status: string;
  confessionText?: string;
  authorId?: string;
  authorNickname?: string;
}

interface AdminDashboardProps {
  onClose: () => void;
}

export default function AdminDashboard({ onClose }: AdminDashboardProps) {
  const [reports, setReports] = useState<ReportData[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

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
          report.authorId = confessionData.authorId;
          
          // Fetch author details
          if (confessionData.authorId) {
            const userSnap = await getDoc(doc(db, 'users', confessionData.authorId));
            if (userSnap.exists()) {
              report.authorNickname = userSnap.data().nickname;
            } else {
              report.authorNickname = 'Usuário Deletado';
            }
          }
        } else {
          report.confessionText = '[Confissão já excluída]';
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
    if (!window.confirm("Tem certeza que deseja excluir esta confissão?")) return;
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
    }
  };

  const handleBanUser = async (reportId: string, confessionId: string, authorId: string) => {
    if (!window.confirm("Tem certeza que deseja BANIR este usuário e excluir a confissão?")) return;
    setActionLoading(reportId);
    try {
      const batch = writeBatch(db);
      if (authorId) {
        batch.delete(doc(db, 'users', authorId));
      }
      batch.delete(doc(db, 'confessions', confessionId));
      batch.update(doc(db, 'reports', reportId), { status: 'resolved' });
      await batch.commit();
      setReports(prev => prev.filter(r => r.id !== reportId));
    } catch (error) {
      console.error("Erro ao banir usuário:", error);
      alert("Erro ao banir usuário.");
    } finally {
      setActionLoading(null);
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
                      <span className="text-sm font-bold text-yellow-500">{report.reason}</span>
                    </div>
                    <span className="text-xs text-zinc-500">
                      {report.createdAt?.toDate ? formatDistanceToNow(report.createdAt.toDate(), { addSuffix: true, locale: ptBR }) : 'agora'}
                    </span>
                  </div>
                  
                  <div className="bg-zinc-950 p-4 rounded-lg border border-zinc-800/50 mb-4">
                    <p className="text-sm text-zinc-300 italic">"{report.confessionText}"</p>
                    <p className="text-xs text-zinc-500 mt-2 text-right">- {report.authorNickname || 'Desconhecido'}</p>
                  </div>

                  <div className="flex flex-wrap gap-2 justify-end pt-2 border-t border-zinc-800/50">
                    <button
                      onClick={() => handleIgnore(report.id)}
                      disabled={actionLoading === report.id}
                      className="px-4 py-2 rounded-lg text-sm font-medium text-zinc-400 bg-zinc-800 hover:bg-zinc-700 hover:text-zinc-200 transition-colors disabled:opacity-50"
                    >
                      Ignorar Denúncia
                    </button>
                    
                    {report.confessionText !== '[Confissão já excluída]' && (
                      <>
                        <button
                          onClick={() => handleDeleteConfession(report.id, report.confessionId)}
                          disabled={actionLoading === report.id}
                          className="px-4 py-2 rounded-lg text-sm font-medium text-orange-400 bg-orange-500/10 hover:bg-orange-500/20 border border-orange-500/20 transition-colors flex items-center space-x-2 disabled:opacity-50"
                        >
                          <Trash2 className="w-4 h-4" />
                          <span>Excluir Confissão</span>
                        </button>
                        
                        {report.authorId && (
                          <button
                            onClick={() => handleBanUser(report.id, report.confessionId, report.authorId!)}
                            disabled={actionLoading === report.id}
                            className="px-4 py-2 rounded-lg text-sm font-medium text-red-400 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 transition-colors flex items-center space-x-2 disabled:opacity-50"
                          >
                            <UserX className="w-4 h-4" />
                            <span>Banir Usuário</span>
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
      </motion.div>
    </div>
  );
}
