console.log("SERVER_START_SEQUENCE: Script loaded");

process.on("uncaughtException", (err) => {
  console.error("SERVER_CRITICAL: Uncaught Exception:", err);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("SERVER_CRITICAL: Unhandled Rejection at:", promise, "reason:", reason);
});

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
      throw new Error("A chave secreta do Stripe (STRIPE_SECRET_KEY) não foi configurada.");
    }
    stripeClient = new Stripe(key, {
      apiVersion: "2024-06-20" as any,
    });
  }
  return stripeClient;
}

async function startServer() {
  console.log("Starting server initialization...");
  const app = express();
  const PORT = 3000;

  // 1. Middleware for Stripe Webhook (MUST be before express.json())
  app.post("/api/webhook", express.raw({ type: "application/json" }), async (req, res) => {
    const sig = req.headers["stripe-signature"] as string;
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    const sharedWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET_SHARED;
    
    if (!webhookSecret) {
      console.error("STRIPE_WEBHOOK_SECRET is missing");
      return res.status(500).json({ error: "Webhook secret missing" });
    }

    let event;
    const stripe = getStripe();

    try {
      event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } catch (err: any) {
      if (sharedWebhookSecret) {
        try {
          event = stripe.webhooks.constructEvent(req.body, sig, sharedWebhookSecret);
        } catch (secondErr: any) {
          return res.status(400).json({ error: `Webhook Error: ${secondErr.message}` });
        }
      } else {
        return res.status(400).json({ error: `Webhook Error: ${err.message}` });
      }
    }

    // Handle the event
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = session.metadata?.userId;
      const eventId = event.id;

      if (userId) {
        console.log(`Processing payment for user: ${userId}`);
        // Note: db is initialized later, so we need to ensure it's available.
        // We'll use a local db reference here.
        const configPath = path.join(__dirname, "firebase-applet-config.json");
        const firebaseConfig = fs.existsSync(configPath) ? JSON.parse(fs.readFileSync(configPath, "utf8")) : {};
        if (!admin.apps.length) admin.initializeApp({ projectId: firebaseConfig.projectId });
        const db = getFirestore(admin.app(), firebaseConfig.firestoreDatabaseId);

        const eventRef = db.collection("stripe_events").doc(eventId);
        const eventDoc = await eventRef.get();
        if (!eventDoc.exists) {
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
          await db.runTransaction(async (transaction) => {
            transaction.set(eventRef, { processedAt: admin.firestore.FieldValue.serverTimestamp() });
            transaction.update(userRef, {
              isPremium: true,
              premiumUntil: admin.firestore.Timestamp.fromDate(newPremiumUntil),
              premiumSince: admin.firestore.FieldValue.serverTimestamp(),
            });
          });
        }
      }
    }
    res.json({ received: true });
  });

  // 2. General Middleware
  app.use(express.json());
  app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    next();
  });

  // 3. Load Firebase & Initialize
  let configPath = path.join(__dirname, "firebase-applet-config.json");
  if (!fs.existsSync(configPath)) {
    configPath = path.join(__dirname, "..", "firebase-applet-config.json");
  }
  
  let firebaseConfig: any = {};
  if (fs.existsSync(configPath)) {
    firebaseConfig = JSON.parse(fs.readFileSync(configPath, "utf8"));
  }

  if (!admin.apps.length) {
    admin.initializeApp({ projectId: firebaseConfig.projectId });
  }
  const db = getFirestore(admin.app(), firebaseConfig.firestoreDatabaseId);

  // 4. API Routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  app.post("/api/create-checkout-session", async (req, res) => {
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
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/send-chat-message", async (req, res) => {
    const { chatId, text, senderId, imageUrl } = req.body;
    if (!chatId || !senderId || (!text && !imageUrl)) {
      return res.status(400).json({ error: "Campos obrigatórios faltando." });
    }

    try {
      const chatRef = db.collection("chats").doc(chatId);
      const chatDoc = await chatRef.get();
      if (!chatDoc.exists) return res.status(404).json({ error: "Chat não encontrado." });

      const chatData = chatDoc.data();
      const recipientId = chatData?.participants?.find((id: string) => id !== senderId);
      if (!recipientId) return res.status(400).json({ error: "Destinatário não encontrado." });

      const messageRef = chatRef.collection("messages").doc();
      const now = admin.firestore.FieldValue.serverTimestamp();

      await db.runTransaction(async (transaction) => {
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
      res.status(500).json({ error: error.message });
    }
  });

  // 5. Static Files & SPA Fallback
  const isProd = process.env.NODE_ENV === "production";
  if (isProd) {
    let distPath = path.resolve(__dirname, "dist");
    if (!fs.existsSync(distPath)) distPath = path.resolve(__dirname, "..", "dist");

    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath));
      app.get("*", (req, res) => {
        if (req.url.startsWith("/api/")) return res.status(404).json({ error: "API route not found" });
        res.sendFile(path.resolve(distPath, "index.html"));
      });
    }
  } else {
    // Dynamic import for Vite to avoid production issues
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  }

  // 6. Global 404 for API
  app.all("/api/*", (req, res) => {
    res.status(404).json({ error: `Rota API não encontrada: ${req.originalUrl}` });
  });

  // 7. Start Listening
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch(err => {
  console.error("SERVER_CRITICAL: Failed to start server:", err);
  process.exit(1);
});
