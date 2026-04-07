import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithRedirect, signInWithPopup, signOut, getRedirectResult } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
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
    if (error.code === 'auth/unauthorized-domain') {
      alert("Erro: O domínio atual não está autorizado no Firebase. Adicione este domínio no painel do Firebase Authentication.");
    } else {
      alert("Erro ao fazer login: " + error.message);
    }
  }
};

export const checkRedirectResult = async () => {
  try {
    const result = await getRedirectResult(auth);
    if (result) {
      console.log("Login com redirecionamento bem-sucedido!");
    }
  } catch (error: any) {
    console.error("Erro no redirecionamento:", error);
    if (error.code === 'auth/unauthorized-domain') {
      alert("Erro: O domínio atual não está autorizado no Firebase. Adicione este domínio no painel do Firebase Authentication.");
    } else {
      alert("Erro ao processar o login: " + error.message);
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
