import express from "express";
import Stripe from "stripe";
import admin from "firebase-admin";
import { getFirestore } from "firebase-admin/firestore";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Lazy Stripe initialization
let stripeClient: Stripe | null = null;
function getStripe() {
  if (!stripeClient) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key || key.trim() === "") {
      throw new Error("STRIPE_SECRET_KEY não configurada.");
    }
    stripeClient = new Stripe(key, {
      apiVersion: "2024-06-20" as any,
    });
  }
  return stripeClient;
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  console.log(`SERVER_START: Starting initialization (Mode: ${process.env.NODE_ENV || 'development'})`);

  // 1. Logging Middleware
  app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
  });

  // 2. Health Check & Ping
  app.get("/api/health", (req, res) => {
    res.status(200).json({ status: "ok", uptime: process.uptime(), timestamp: new Date().toISOString() });
  });

  app.get("/api/ping", (req, res) => {
    res.status(200).send("pong");
  });

  // 3. Stripe Webhook (Raw Body)
  app.post("/api/webhook", express.raw({ type: "application/json" }), async (req, res) => {
    console.log("WEBHOOK_RECEIVED");
    const sig = req.headers["stripe-signature"] as string;
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    
    if (!webhookSecret) {
      console.error("STRIPE_WEBHOOK_SECRET is missing");
      return res.status(500).json({ error: "Webhook secret missing" });
    }

    try {
      const stripe = getStripe();
      const event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);

      if (event.type === "checkout.session.completed") {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.metadata?.userId;
        if (userId) {
          console.log(`PAYMENT_SUCCESS: User ${userId}`);
          const configPath = fs.existsSync(path.join(__dirname, "firebase-applet-config.json"))
            ? path.join(__dirname, "firebase-applet-config.json")
            : path.join(__dirname, "..", "firebase-applet-config.json");
          const firebaseConfig = fs.existsSync(configPath) ? JSON.parse(fs.readFileSync(configPath, "utf8")) : {};
          if (!admin.apps.length) admin.initializeApp({ projectId: firebaseConfig.projectId });
          const db = getFirestore(admin.app(), firebaseConfig.firestoreDatabaseId);

          const userRef = db.collection("users").doc(userId);
          const userDoc = await userRef.get();
          const thirtyDaysInMs = 30 * 24 * 60 * 60 * 1000;
          let newPremiumUntil: Date;
          if (userDoc.exists) {
            const userData = userDoc.data();
            const currentPremiumUntil = userData?.premiumUntil?.toDate?.() || new Date(0);
            newPremiumUntil = currentPremiumUntil > new Date() ? new Date(currentPremiumUntil.getTime() + thirtyDaysInMs) : new Date(Date.now() + thirtyDaysInMs);
          } else {
            newPremiumUntil = new Date(Date.now() + thirtyDaysInMs);
          }
          await userRef.update({
            isPremium: true,
            premiumUntil: admin.firestore.Timestamp.fromDate(newPremiumUntil),
            premiumSince: admin.firestore.FieldValue.serverTimestamp(),
          });
        }
      }
      res.json({ received: true });
    } catch (err: any) {
      console.error("Webhook Error:", err.message);
      res.status(400).json({ error: `Webhook Error: ${err.message}` });
    }
  });

  // 4. JSON Middleware
  app.use(express.json());

  // 5. Firebase Initialization
  let db: any;
  try {
    const configPath = fs.existsSync(path.join(__dirname, "firebase-applet-config.json"))
      ? path.join(__dirname, "firebase-applet-config.json")
      : path.join(__dirname, "..", "firebase-applet-config.json");
    
    const firebaseConfig = fs.existsSync(configPath) ? JSON.parse(fs.readFileSync(configPath, "utf8")) : {};
    if (!admin.apps.length) {
      admin.initializeApp({ projectId: firebaseConfig.projectId });
    }
    db = getFirestore(admin.app(), firebaseConfig.firestoreDatabaseId);
    console.log("FIREBASE_INIT: Success");
  } catch (e) {
    console.error("FIREBASE_INIT: Failed", e);
  }

  // 6. API Routes
  app.post("/api/create-checkout-session", async (req, res) => {
    console.log("API_CALL: create-checkout-session");
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: "User ID is required" });

    try {
      const stripe = getStripe();
      const origin = req.headers.origin || process.env.VITE_APP_URL || 'http://localhost:3000';
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ["card", "boleto"],
        payment_method_options: { boleto: { expires_after_days: 3 } },
        line_items: [{
          price_data: {
            currency: "brl",
            product_data: { name: "Plano Premium Mensal - Confissões" },
            unit_amount: 1499,
          },
          quantity: 1,
        }],
        mode: "payment",
        success_url: `${origin}?payment=success`,
        cancel_url: `${origin}?payment=cancel`,
        metadata: { userId },
      });
      res.json({ id: session.id, url: session.url });
    } catch (error: any) {
      console.error("Stripe Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/send-chat-message", async (req, res) => {
    console.log("API_CALL: send-chat-message");
    const { chatId, text, senderId, imageUrl } = req.body;
    if (!chatId || !senderId || (!text && !imageUrl)) {
      return res.status(400).json({ error: "Campos obrigatórios faltando." });
    }

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
        transaction.set(messageRef, { senderId, text: text || "", imageUrl: imageUrl || null, createdAt: now, isSystem: false });
        transaction.update(chatRef, {
          lastMessage: text || "📷 Foto",
          updatedAt: now,
          [`unreadCount.${recipientId}`]: admin.firestore.FieldValue.increment(1)
        });
      });

      // Push notification (async)
      (async () => {
        try {
          const privateDataDoc = await db.collection("users").doc(recipientId).collection("private").doc("data").get();
          const fcmToken = privateDataDoc.data()?.fcmToken;
          if (fcmToken) {
            const senderDoc = await db.collection("users").doc(senderId).get();
            const senderName = senderDoc.data()?.nickname || "Alguém";
            await admin.messaging().send({
              notification: { title: senderName, body: text || "Enviou uma foto" },
              data: { chatId, type: "chat_message" },
              token: fcmToken,
            });
          }
        } catch (e) { console.error("Push error:", e); }
      })();

      res.json({ success: true, messageId: messageRef.id });
    } catch (error: any) {
      console.error("Chat API Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // 7. Static Files & SPA Fallback
  const rootPath = process.cwd();
  let distPath = path.resolve(rootPath, "dist");
  
  // Fallback for different structures
  if (!fs.existsSync(distPath)) {
    distPath = path.resolve(__dirname, "dist");
  }
  if (!fs.existsSync(distPath)) {
    distPath = path.resolve(__dirname, "..", "dist");
  }

  const isProd = process.env.NODE_ENV === "production" || fs.existsSync(path.join(distPath, "index.html"));

  if (isProd && fs.existsSync(distPath)) {
    const indexPath = path.resolve(distPath, "index.html");
    console.log(`SERVER_STATIC: Serving from ${distPath}`);
    console.log(`SERVER_STATIC: Index path: ${indexPath} (Exists: ${fs.existsSync(indexPath)})`);
    
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      if (req.url.startsWith("/api/")) {
        return res.status(404).json({ error: `API route not found: ${req.url}` });
      }
      
      if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
      } else {
        res.status(404).json({ 
          error: "Frontend not found", 
          details: `Expected index.html at ${indexPath}`,
          cwd: process.cwd(),
          dirname: __dirname
        });
      }
    });
  } else {
    console.log("SERVER_DEV: Running with Vite middleware...");
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  }

  // 8. Final Catch-all
  app.use((req, res) => {
    res.status(404).json({ error: "Not Found", path: req.url });
  });

  // 9. Start Listening
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`SERVER_READY: Listening on 0.0.0.0:${PORT}`);
  });
}

startServer().catch(err => {
  console.error("SERVER_CRITICAL: Failed to start server:", err);
  process.exit(1);
});
