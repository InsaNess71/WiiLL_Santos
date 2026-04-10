import { initializeApp } from 'firebase/app';
import { getAuth, signOut, signInAnonymously, GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore';
import { getMessaging, isSupported } from 'firebase/messaging';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);

// Enable offline persistence using the modern API
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
}, firebaseConfig.firestoreDatabaseId);

export const auth = getAuth(app);

// Initialize Firebase Cloud Messaging (FCM) safely
export const getMessagingInstance = async () => {
  try {
    const supported = await isSupported();
    if (supported) {
      return getMessaging(app);
    }
  } catch (err) {
    console.warn('Firebase Messaging is not supported in this browser.', err);
  }
  return null;
};

const googleProvider = new GoogleAuthProvider();

export const signInWithGoogle = async () => {
  try {
    await signInWithPopup(auth, googleProvider);
  } catch (error: any) {
    console.error("Error signing in with Google", error);
    alert("Erro ao entrar com Google: " + error.message);
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

export const logOut = async () => {
  try {
    await signOut(auth);
  } catch (error) {
    console.error("Error signing out", error);
  }
};
