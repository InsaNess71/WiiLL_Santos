import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, signOut, signInAnonymously } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

// Only use the proxy domain if we are actually running on Netlify.
// This prevents breaking the AI Studio preview environment.
const isNetlify = window.location.hostname.includes('netlify.app');

const config = {
  ...firebaseConfig,
  authDomain: isNetlify ? window.location.hostname : firebaseConfig.authDomain
};

const app = initializeApp(config);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);

export const checkRedirectResult = async () => {
  try {
    await getRedirectResult(auth);
  } catch (error: any) {
    console.error("Redirect auth error:", error);
    if (error.code === 'auth/unauthorized-domain') {
      alert("ERRO DE SEGURANÇA: O site não está autorizado no Firebase! Vá no painel do Firebase > Authentication > Settings > Authorized Domains e adicione este link.");
    }
  }
};

export const signInAnonymouslyUser = async () => {
  try {
    await signInAnonymously(auth);
  } catch (error: any) {
    console.error("Error signing in anonymously", error);
    if (error.code === 'auth/operation-not-allowed') {
      alert("O Login Anônimo não está ativado! Vá no Firebase > Authentication > Sign-in method > Adicionar novo provedor > Anônimo > Ativar.");
    } else {
      alert("Erro ao entrar: " + error.message);
    }
  }
};

export const signInWithGoogle = async () => {
  try {
    const provider = new GoogleAuthProvider();
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    
    if (isMobile) {
      // Mobile browsers block popups aggressively, so we use redirect.
      await signInWithRedirect(auth, provider);
    } else {
      // Desktop prefers popup for a smoother experience.
      await signInWithPopup(auth, provider);
    }
  } catch (error: any) {
    console.error("Error signing in with Google", error);
    if (error.code === 'auth/popup-blocked') {
      alert("O pop-up foi bloqueado. Tentando método alternativo...");
      const provider = new GoogleAuthProvider();
      await signInWithRedirect(auth, provider);
    } else if (error.code === 'auth/unauthorized-domain') {
      alert("ERRO DE SEGURANÇA: O site não está autorizado no Firebase! Vá no painel do Firebase > Authentication > Settings > Authorized Domains e adicione este link.");
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
