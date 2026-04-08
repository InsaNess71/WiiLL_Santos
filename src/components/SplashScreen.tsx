import { motion } from 'motion/react';
import { Ghost } from 'lucide-react';

export default function SplashScreen() {
  return (
    <motion.div
      initial={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
      className="fixed inset-0 z-[999] bg-zinc-950 flex flex-col items-center justify-center"
    >
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="flex flex-col items-center"
      >
        <div className="w-24 h-24 bg-pink-500/10 rounded-3xl flex items-center justify-center mb-6 shadow-[0_0_40px_rgba(236,72,153,0.2)]">
          <Ghost className="w-12 h-12 text-pink-500" />
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-zinc-100">
          Confissões<span className="text-pink-500">.</span>
        </h1>
        <p className="text-zinc-500 mt-2 font-medium">Seu segredo está seguro.</p>
      </motion.div>
    </motion.div>
  );
}
