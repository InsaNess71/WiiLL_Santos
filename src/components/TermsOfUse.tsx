import { X } from 'lucide-react';
import { motion } from 'motion/react';

interface TermsOfUseProps {
  onClose: () => void;
}

export default function TermsOfUse({ onClose }: TermsOfUseProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-2xl max-h-[80vh] flex flex-col shadow-2xl"
      >
        <div className="flex items-center justify-between p-4 border-b border-zinc-800 shrink-0">
          <h2 className="text-lg font-semibold text-zinc-100">Termos de Uso</h2>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-200 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto custom-scrollbar text-zinc-300 space-y-6">
          <section>
            <h3 className="text-pink-500 font-bold mb-2">1. Aceitação dos Termos</h3>
            <p className="text-sm leading-relaxed">
              Ao acessar e usar o Confissões Anônimas, você concorda em cumprir estes Termos de Uso. Se você não concorda com qualquer parte destes termos, não deve usar o aplicativo.
            </p>
          </section>

          <section>
            <h3 className="text-pink-500 font-bold mb-2">2. Regras de Postagem</h3>
            <p className="text-sm leading-relaxed">
              Para manter uma comunidade segura e respeitosa, é estritamente proibido postar:
            </p>
            <ul className="list-disc list-inside text-sm mt-2 space-y-1 ml-2 text-red-400">
              <li>Conteúdo ilegal, criminoso ou que incentive a violência.</li>
              <li>Discurso de ódio, racismo, homofobia ou qualquer forma de discriminação.</li>
              <li>Assédio, bullying, ameaças ou exposição de dados pessoais de terceiros (doxxing).</li>
              <li>Conteúdo sexualmente explícito, pornografia ou pedofilia.</li>
              <li>Spam, correntes ou propaganda comercial.</li>
            </ul>
          </section>

          <section>
            <h3 className="text-pink-500 font-bold mb-2">3. Moderação e Denúncias</h3>
            <p className="text-sm leading-relaxed">
              Utilizamos filtros automáticos para bloquear palavras ofensivas. Além disso, a comunidade conta com um botão de "Denunciar" em cada confissão. Confissões denunciadas serão analisadas e removidas se violarem as regras. Usuários que violarem as regras repetidamente poderão ser banidos permanentemente.
            </p>
          </section>

          <section>
            <h3 className="text-pink-500 font-bold mb-2">4. Responsabilidade</h3>
            <p className="text-sm leading-relaxed">
              O Confissões Anônimas não se responsabiliza pelo conteúdo gerado pelos usuários. O uso do aplicativo é por sua conta e risco.
            </p>
          </section>
        </div>
      </motion.div>
    </div>
  );
}
