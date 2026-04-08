import { X } from 'lucide-react';
import { motion } from 'motion/react';

interface PrivacyPolicyProps {
  onClose: () => void;
}

export default function PrivacyPolicy({ onClose }: PrivacyPolicyProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-2xl max-h-[80vh] flex flex-col shadow-2xl"
      >
        <div className="flex items-center justify-between p-4 border-b border-zinc-800 shrink-0">
          <h2 className="text-lg font-semibold text-zinc-100">Política de Privacidade</h2>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-200 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto custom-scrollbar text-zinc-300 space-y-6">
          <section>
            <h3 className="text-pink-500 font-bold mb-2">1. Coleta de Dados</h3>
            <p className="text-sm leading-relaxed">
              Coletamos informações mínimas necessárias para o funcionamento do aplicativo. Isso inclui seu endereço de IP (para prevenção de spam), informações de dispositivo e dados de autenticação caso opte por fazer login com o Google. Se você usar a conta de visitante, um ID anônimo será gerado.
            </p>
          </section>

          <section>
            <h3 className="text-pink-500 font-bold mb-2">2. Uso das Informações</h3>
            <p className="text-sm leading-relaxed">
              As informações coletadas são usadas exclusivamente para:
            </p>
            <ul className="list-disc list-inside text-sm mt-2 space-y-1 ml-2">
              <li>Manter sua sessão ativa e salvar suas preferências.</li>
              <li>Prevenir abusos, spam e comportamentos que violem nossos termos.</li>
              <li>Melhorar a experiência geral do aplicativo.</li>
            </ul>
            <p className="text-sm leading-relaxed mt-2">
              Nós <strong>nunca</strong> vendemos seus dados para terceiros.
            </p>
          </section>

          <section>
            <h3 className="text-pink-500 font-bold mb-2">3. Conteúdo Gerado pelo Usuário</h3>
            <p className="text-sm leading-relaxed">
              As confissões e comentários são públicos e anônimos (a menos que você revele sua identidade no texto). Não nos responsabilizamos pelo conteúdo postado pelos usuários, mas mantemos o direito de remover qualquer conteúdo que viole nossos Termos de Uso.
            </p>
          </section>

          <section>
            <h3 className="text-pink-500 font-bold mb-2">4. Contato</h3>
            <p className="text-sm leading-relaxed">
              Se você tiver dúvidas sobre nossa política de privacidade ou quiser solicitar a exclusão dos seus dados, entre em contato através do email: suporte@confissoesanonimas.com
            </p>
          </section>
        </div>
      </motion.div>
    </div>
  );
}
