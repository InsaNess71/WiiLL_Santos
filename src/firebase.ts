import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);

export const signInWithGoogle = async () => {
  try {
    const provider = new GoogleAuthProvider();
    await signInWithPopup(auth, provider);
  } catch (error: any) {
    console.error("Error signing in with Google", error);
    if (error.code === 'auth/popup-blocked') {
      alert("O pop-up de login foi bloqueado pelo seu navegador. Por favor, permita pop-ups para este site ou tente em outro navegador (como Chrome ou Safari).");
    } else if (error.code === 'auth/unauthorized-domain') {
      alert("ERRO DE SEGURANÇA: O site confissoesanonimas.netlify.app não está autorizado no Firebase! Vá no painel do Firebase > Authentication > Settings > Authorized Domains e adicione este link.");
    } else {
      alert("Erro ao fazer login: " + error.message);
    }
  }
};

export const logOut = async () => {
  try {
    await signOut(auth);
  } catch (error) {
    console.error("Error signing out", error);
  }
};
