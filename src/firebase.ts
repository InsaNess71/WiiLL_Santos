import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, signOut } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

// Override authDomain to use the current hostname.
// This works with the proxy in netlify.toml to bypass mobile browser cookie blocking (ITP)
const config = {
  ...firebaseConfig,
  authDomain: window.location.hostname === 'localhost' ? firebaseConfig.authDomain : window.location.hostname
};

const app = initializeApp(config);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);

export const signInWithGoogle = async () => {
  try {
    const provider = new GoogleAuthProvider();
    if (window.self !== window.top) {
      await signInWithPopup(auth, provider);
    } else {
      await signInWithRedirect(auth, provider);
    }
  } catch (error: any) {
    console.error("Error signing in with Google", error);
    if (error.code === 'auth/popup-blocked') {
      alert("O pop-up de login foi bloqueado pelo seu navegador. Por favor, permita pop-ups para este site ou tente em outro navegador (como Chrome ou Safari).");
    } else if (error.code === 'auth/unauthorized-domain') {
      alert("Erro: O domínio atual não está autorizado no Firebase. Adicione este domínio no painel do Firebase Authentication.");
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
