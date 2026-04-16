import express from "express";
import admin from "firebase-admin";
import { getFirestore } from "firebase-admin/firestore";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// --- CONFIGURATION & INITIALIZATION ---

// Firebase Initialization (Safe)
let db: any;
let messaging: admin.messaging.Messaging | null = null;

function initFirebase() {
  if (db) return { db, messaging };
  try {
    const configPath = fs.existsSync(path.join(__dirname, "firebase-applet-config.json"))
      ? path.join(__dirname, "firebase-applet-config.json")
      : path.join(__dirname, "..", "firebase-applet-config.json");
    
    const firebaseConfig = fs.existsSync(configPath) ? JSON.parse(fs.readFileSync(configPath, "utf8")) : {};
    if (!admin.apps.length) {
      if (firebaseConfig.projectId) {
        admin.initializeApp({ projectId: firebaseConfig.projectId });
      } else {
        // Fallback for environment without config file
        admin.initializeApp();
      }
    }
    // Try named database first, then fallback to default
    try {
      if (firebaseConfig.firestoreDatabaseId) {
        db = getFirestore(admin.app(), firebaseConfig.firestoreDatabaseId);
      } else {
        db = getFirestore(admin.app());
      }
    } catch (e) {
      console.warn("FIREBASE: Firestore connection failed, trying default...");
      db = getFirestore(admin.app());
    }
    
    try {
      messaging = admin.messaging();
    } catch (e) {
      console.warn("FIREBASE: Cloud Messaging not available in this environment.");
      messaging = null;
    }
    console.log("FIREBASE: Initialized successfully");
    return { db, messaging };
  } catch (e) {
    console.error("FIREBASE: Initialization failed", e);
    return { db: null, messaging: null };
  }
}

async function sendNotification(userId: string, title: string, body: string, data: any = {}) {
  const { db, messaging } = initFirebase();
  if (!db || !messaging) return;

  try {
    const tokenDoc = await db.collection("users").doc(userId).collection("private").doc("data").get();
    if (!tokenDoc.exists) return;

    const fcmToken = tokenDoc.data()?.fcmToken;
    if (!fcmToken) return;

    await messaging.send({
      token: fcmToken,
      notification: { title, body },
      data: {
        ...data,
        click_action: "FLUTTER_NOTIFICATION_CLICK", // Standard for some clients
      },
      webpush: {
        notification: {
          icon: "/icon-192.png",
          badge: "/icon-192.png",
          vibrate: [200, 100, 200],
        },
        fcmOptions: {
          link: "/",
        }
      }
    });
    console.log(`FCM: Notification sent to user ${userId}`);
  } catch (err: any) {
    if (err.code === 7 || err.message?.includes('PERMISSION_DENIED')) {
      console.warn(`FCM: Notification skipped for ${userId} due to missing permissions (expected in preview environment).`);
    } else {
      console.error(`FCM ERROR: Failed to send to ${userId}`, err);
    }
  }
}

// --- SERVER SETUP ---

async function startServer() {
  const app = express();
  const PORT = 3000;

  // 1. Logging Middleware
  app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
  });

  // 3. Body Parsers
  app.use(express.json());

  // 4. API Routes (Mounted early for reliability)
  const apiRouter = express.Router();
  app.use("/api", apiRouter);

  apiRouter.get("/health", (req, res) => {
    const { db } = initFirebase();
    res.json({ 
      status: "ok", 
      timestamp: new Date().toISOString(), 
      initialized: !!db
    });
  });

  apiRouter.post("/send-chat-message", async (req, res) => {
    console.log("API_CALL: send-chat-message - START");
    const { chatId, text, senderId, imageUrl } = req.body;
    if (!chatId || !senderId || (!text && !imageUrl)) {
      return res.status(400).json({ error: "Campos obrigatórios faltando." });
    }

    const { db } = initFirebase();
    if (!db) return res.status(500).json({ error: "Database not initialized" });

    try {
      const chatRef = db.collection("chats").doc(chatId);
      const chatDoc = await chatRef.get();
      if (!chatDoc.exists) return res.status(404).json({ error: "Chat não encontrado." });

      const chatData = chatDoc.data();
      const recipientId = chatData?.participants?.find((id: string) => id !== senderId);
      if (!recipientId) return res.status(400).json({ error: "Destinatário não encontrado." });

      const messageRef = chatRef.collection("messages").doc();
      const now = admin.firestore.FieldValue.serverTimestamp();

      await db.runTransaction(async (transaction: any) => {
        transaction.set(messageRef, { 
          senderId, 
          text: text || "", 
          imageUrl: imageUrl || null, 
          createdAt: now, 
          isSystem: false 
        });
        transaction.update(chatRef, {
          lastMessage: text || "📷 Foto",
          updatedAt: now,
          [`unreadCount.${recipientId}`]: admin.firestore.FieldValue.increment(1)
        });
      });

      // Send Push Notification
      const senderDoc = await db.collection("users").doc(senderId).get();
      const senderName = senderDoc.exists ? senderDoc.data()?.nickname : "Alguém";
      
      sendNotification(
        recipientId, 
        `Mensagem de ${senderName}`, 
        text || "Enviou uma foto para você.",
        { chatId, type: "chat" }
      );

      console.log(`API_CALL: send-chat-message - SUCCESS: ${messageRef.id}`);
      res.json({ success: true, messageId: messageRef.id });
    } catch (error: any) {
      console.error("API_CALL: send-chat-message - ERROR:", error);
      res.status(500).json({ error: error.message });
    }
  });

  apiRouter.post("/notify", async (req, res) => {
    const { userId, title, body, data } = req.body;
    if (!userId || !title || !body) {
      return res.status(400).json({ error: "Campos obrigatórios faltando." });
    }

    try {
      await sendNotification(userId, title, body, data);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Catch-all for undefined API routes
  apiRouter.all("*", (req, res) => {
    console.warn(`API_CALL: Route not found - ${req.method} ${req.url}`);
    res.status(404).json({ error: "API Route not found", method: req.method, path: req.url });
  });

  // 5. Static Files & SPA Fallback
  const rootDir = process.cwd();
  
  // Resolve paths absolutely to avoid any ambiguity
  const possibleDistPaths = [
    path.resolve(rootDir, "dist"),
    path.resolve(__dirname, "dist"),
    path.resolve(__dirname, "..", "dist"),
    path.join(rootDir, "dist")
  ];

  let distPath = "";
  let indexPath = "";
  let distExists = false;

  for (const p of possibleDistPaths) {
    const i = path.join(p, "index.html");
    if (fs.existsSync(p) && fs.existsSync(i)) {
      distPath = p;
      indexPath = i;
      distExists = true;
      break;
    }
  }

  console.log(`SERVER: Final distPath resolved to: ${distPath}`);
  console.log(`SERVER: Final indexPath resolved to: ${indexPath}`);

  if (distExists) {
    console.log(`SERVER: Serving static files from ${distPath}`);
    
    // Serve static files first
    app.use(express.static(distPath, {
      maxAge: '1h', // Lowered for testing
      etag: true,
      index: false // We handle index manually below
    }));
    
    // Catch-all for SPA
    app.get("*", (req, res) => {
      // 1. API routes must return 404 JSON if not handled
      if (req.url.startsWith("/api/")) {
        return res.status(404).json({ error: `API route not found: ${req.url}` });
      }
      
      // 2. For everything else, serve index.html
      // We use the absolute path resolved at startup
      res.sendFile(indexPath, (err) => {
        if (err) {
          console.error(`SERVER ERROR: Failed to send index.html from ${indexPath}:`, err);
          // Fallback check
          const fallbackIndex = path.join(process.cwd(), "dist", "index.html");
          if (fs.existsSync(fallbackIndex)) {
            res.sendFile(fallbackIndex);
          } else {
            res.status(404).send("Página não encontrada. Por favor, recarregue o site.");
          }
        }
      });
    });
  } else {
    console.log("SERVER: No dist folder found. Falling back to Vite middleware (Development Mode)");
    try {
      const { createServer: createViteServer } = await import("vite");
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: "spa",
      });
      app.use(vite.middlewares);
    } catch (e) {
      console.error("SERVER ERROR: Failed to start Vite middleware", e);
      app.get("*", (req, res) => {
        res.status(500).send("Server is initializing or misconfigured. Please try again in a moment.");
      });
    }
  }

  // 6. Final 404
  app.use((req, res) => {
    res.status(404).json({ error: "Not Found", path: req.url });
  });

  // 7. Start Listening
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`SERVER: Ready and listening on port ${PORT}`);
    // Initialize Firebase in the background
    initFirebase();
  });
}

startServer().catch(err => {
  console.error("SERVER CRITICAL ERROR:", err);
  process.exit(1);
});
