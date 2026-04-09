importScripts('https://www.gstatic.com/firebasejs/10.11.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.11.0/firebase-messaging-compat.js');

// Configuração do Firebase
firebase.initializeApp({
  apiKey: "AIzaSyDONBebCMHg10KnThgUH-MTvmkqGY0-MMk",
  authDomain: "gen-lang-client-0505440073.firebaseapp.com",
  projectId: "gen-lang-client-0505440073",
  storageBucket: "gen-lang-client-0505440073.firebasestorage.app",
  messagingSenderId: "731579473153",
  appId: "1:731579473153:web:b3d18f9c32a7d1791a4f00"
});

const messaging = firebase.messaging();

// Lida com mensagens recebidas em segundo plano (quando o app está fechado)
messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Recebeu mensagem em segundo plano ', payload);
  
  const notificationTitle = payload.notification?.title || 'Nova Notificação';
  const notificationOptions = {
    body: payload.notification?.body || 'Você tem uma nova mensagem.',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    data: payload.data
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});
