import { initializeApp } from 'firebase/app';
import { getAuth, signOut, signInAnonymously } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);

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

export const logOut = async () => {
  try {
    await signOut(auth);
  } catch (error) {
    console.error("Error signing out", error);
  }
};
