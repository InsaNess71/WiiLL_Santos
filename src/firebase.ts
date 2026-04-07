import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithRedirect, signInWithPopup, signOut } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);

export const signInWithGoogle = async () => {
  try {
    const provider = new GoogleAuthProvider();
    // Se estiver rodando dentro de um iframe (como a prévia do AI Studio), usa Popup
    if (window.self !== window.top) {
      await signInWithPopup(auth, provider);
    } else {
      // Se estiver rodando solto (Netlify, Celular, PWA), usa Redirecionamento
      await signInWithRedirect(auth, provider);
    }
  } catch (error) {
    console.error("Error signing in with Google", error);
  }
};

export const logOut = async () => {
  try {
    await signOut(auth);
  } catch (error) {
    console.error("Error signing out", error);
  }
};
