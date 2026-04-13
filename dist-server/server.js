// server.ts
import express from "express";
import { createServer as createViteServer } from "vite";
import Stripe from "stripe";
import admin from "firebase-admin";
import { getFirestore } from "firebase-admin/firestore";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
console.log("SERVER_START_SEQUENCE: Script loaded");
process.on("uncaughtException", (err) => {
  console.error("SERVER_CRITICAL: Uncaught Exception:", err);
});
process.on("unhandledRejection", (reason, promise) => {
  console.error("SERVER_CRITICAL: Unhandled Rejection at:", promise, "reason:", reason);
});
var __dirname = path.dirname(fileURLToPath(import.meta.url));
if (!process.env.NODE_ENV) {
  process.env.NODE_ENV = "production";
}
var stripeClient = null;
function getStripe() {
  if (!stripeClient) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key || key.trim() === "") {
      throw new Error("A chave secreta do Stripe (STRIPE_SECRET_KEY) n\xE3o foi configurada. Adicione-a nas configura\xE7\xF5es do projeto.");
    }
    stripeClient = new Stripe(key, {
      apiVersion: "2024-06-20"
    });
  }
  return stripeClient;
}
async function startServer() {
  console.log("Starting server initialization...");
  const app = express();
  const PORT = 3e3;
  const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server is listening on 0.0.0.0:${PORT}`);
    console.log(`Health check available at http://0.0.0.0:${PORT}/api/health`);
  });
  app.use((req, res, next) => {
    console.log(`${(/* @__PURE__ */ new Date()).toISOString()} - ${req.method} ${req.url}`);
    next();
  });
  let configPath = path.join(__dirname, "firebase-applet-config.json");
  if (!fs.existsSync(configPath)) {
    configPath = path.join(__dirname, "..", "firebase-applet-config.json");
  }
  let firebaseConfig;
  try {
    if (fs.existsSync(configPath)) {
      firebaseConfig = JSON.parse(fs.readFileSync(configPath, "utf8"));
    } else {
      console.error("CRITICAL: firebase-applet-config.json not found at", configPath);
      firebaseConfig = {
        projectId: process.env.VITE_FIREBASE_PROJECT_ID || "fallback-id",
        firestoreDatabaseId: process.env.VITE_FIREBASE_DATABASE_ID || "(default)"
      };
    }
  } catch (err) {
    console.error("Error loading firebase config:", err);
    firebaseConfig = {};
  }
  try {
    if (!admin.apps.length) {
      console.log("Initializing Firebase Admin with Project ID:", firebaseConfig.projectId);
      admin.initializeApp({
        projectId: firebaseConfig.projectId
      });
      console.log("Firebase Admin initialized successfully.");
    }
  } catch (err) {
    console.error("CRITICAL ERROR: Failed to initialize Firebase Admin:", err);
  }
  let db;
  try {
    db = getFirestore(admin.app(), firebaseConfig.firestoreDatabaseId);
    console.log("Firestore Admin initialized successfully.");
  } catch (err) {
    console.error("CRITICAL ERROR: Failed to initialize Firestore Admin:", err);
    db = null;
  }
  app.use(express.json());
  console.log("Registering API routes...");
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", timestamp: (/* @__PURE__ */ new Date()).toISOString() });
  });
  app.post("/api/webhook", express.raw({ type: "application/json" }), async (req, res) => {
    const sig = req.headers["stripe-signature"];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    const sharedWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET_SHARED;
    if (!webhookSecret) {
      console.error("STRIPE_WEBHOOK_SECRET is missing");
      return res.status(500).send("Webhook secret missing");
    }
    let event;
    const stripe = getStripe();
    try {
      event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } catch (err) {
      if (sharedWebhookSecret) {
        try {
          event = stripe.webhooks.constructEvent(req.body, sig, sharedWebhookSecret);
        } catch (secondErr) {
          console.error(`Webhook Error (Shared): ${secondErr.message}`);
          return res.status(400).send(`Webhook Error: ${secondErr.message}`);
        }
      } else {
        console.error(`Webhook Error: ${err.message}`);
        return res.status(400).send(`Webhook Error: ${err.message}`);
      }
    }
    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      const userId = session.metadata?.userId;
      const eventId = event.id;
      if (userId) {
        console.log(`Processing payment for user: ${userId} (Event: ${eventId})`);
        const eventRef = db.collection("stripe_events").doc(eventId);
        const eventDoc = await eventRef.get();
        if (eventDoc.exists) {
          console.log(`Event ${eventId} already processed.`);
          return res.json({ received: true, already_processed: true });
        }
        const userRef = db.collection("users").doc(userId);
        const userDoc = await userRef.get();
        const thirtyDaysInMs = 30 * 24 * 60 * 60 * 1e3;
        let newPremiumUntil;
        if (userDoc.exists) {
          const userData = userDoc.data();
          const currentPremiumUntil = userData?.premiumUntil?.toDate?.() || /* @__PURE__ */ new Date(0);
          if (currentPremiumUntil > /* @__PURE__ */ new Date()) {
            newPremiumUntil = new Date(currentPremiumUntil.getTime() + thirtyDaysInMs);
          } else {
            newPremiumUntil = new Date(Date.now() + thirtyDaysInMs);
          }
        } else {
          newPremiumUntil = new Date(Date.now() + thirtyDaysInMs);
        }
        await db.runTransaction(async (transaction) => {
          transaction.set(eventRef, { processedAt: admin.firestore.FieldValue.serverTimestamp() });
          transaction.update(userRef, {
            isPremium: true,
            premiumUntil: admin.firestore.Timestamp.fromDate(newPremiumUntil),
            premiumSince: admin.firestore.FieldValue.serverTimestamp()
          });
        });
        console.log(`User ${userId} premium extended until ${newPremiumUntil.toISOString()}`);
      }
    }
    res.json({ received: true });
  });
  app.post("/api/create-checkout-session", async (req, res) => {
    console.log("POST /api/create-checkout-session", req.body);
    const { userId } = req.body;
    if (!userId) {
      return res.status(400).json({ error: "User ID is required" });
    }
    try {
      const stripe = getStripe();
      const origin = req.headers.origin || process.env.VITE_APP_URL || "http://localhost:3000";
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ["card", "boleto"],
        payment_method_options: {
          boleto: {
            expires_after_days: 3
          }
        },
        line_items: [
          {
            price_data: {
              currency: "brl",
              product_data: {
                name: "Plano Premium Mensal - Confiss\xF5es",
                description: "30 dias de acesso a fotos e recursos exclusivos."
              },
              unit_amount: 1499
              // R$ 14,99
            },
            quantity: 1
          }
        ],
        mode: "payment",
        success_url: `${origin}?payment=success`,
        cancel_url: `${origin}?payment=cancel`,
        metadata: {
          userId
        }
      });
      res.json({ id: session.id, url: session.url });
    } catch (error) {
      console.error("Stripe Error:", error);
      res.status(500).json({ error: error.message });
    }
  });
  app.post("/api/send-chat-message", async (req, res) => {
    const { chatId, text, senderId, imageUrl } = req.body;
    if (!chatId || !senderId || !text && !imageUrl) {
      return res.status(400).json({ error: "Campos obrigat\xF3rios faltando." });
    }
    try {
      const chatRef = db.collection("chats").doc(chatId);
      const chatDoc = await chatRef.get();
      if (!chatDoc.exists) {
        return res.status(404).json({ error: "Chat n\xE3o encontrado." });
      }
      const chatData = chatDoc.data();
      const participants = chatData?.participants || [];
      const recipientId = participants.find((id) => id !== senderId);
      if (!recipientId) {
        return res.status(400).json({ error: "Destinat\xE1rio n\xE3o encontrado." });
      }
      const messageRef = chatRef.collection("messages").doc();
      const now = admin.firestore.FieldValue.serverTimestamp();
      await db.runTransaction(async (transaction) => {
        transaction.set(messageRef, {
          senderId,
          text: text || "",
          imageUrl: imageUrl || null,
          createdAt: now,
          isSystem: false
        });
        const unreadKey = `unreadCount.${recipientId}`;
        transaction.update(chatRef, {
          lastMessage: text || "\u{1F4F7} Foto",
          updatedAt: now,
          [unreadKey]: admin.firestore.FieldValue.increment(1)
        });
      });
      const sendPush = async () => {
        try {
          const privateDataDoc = await db.collection("users").doc(recipientId).collection("private").doc("data").get();
          const fcmToken = privateDataDoc.data()?.fcmToken;
          if (fcmToken) {
            const senderDoc = await db.collection("users").doc(senderId).get();
            const senderName = senderDoc.data()?.nickname || "Algu\xE9m";
            const message = {
              notification: {
                title: senderName,
                body: text || "Enviou uma foto"
              },
              data: {
                chatId,
                type: "chat_message",
                click_action: "FLUTTER_NOTIFICATION_CLICK"
                // For mobile compatibility
              },
              token: fcmToken
            };
            await admin.messaging().send(message);
            console.log(`Push notification sent to ${recipientId}`);
          }
        } catch (pushErr) {
          console.error("Error sending push notification:", pushErr);
        }
      };
      sendPush();
      res.json({ success: true, messageId: messageRef.id });
    } catch (error) {
      console.error("Chat API Error:", error);
      res.status(500).json({ error: error.message });
    }
  });
  app.use("/api/*", (req, res) => {
    console.log(`404 at ${req.originalUrl}`);
    res.status(404).json({ error: `Rota API n\xE3o encontrada: ${req.originalUrl}` });
  });
  const isProd = process.env.NODE_ENV === "production";
  console.log(`Server mode: ${isProd ? "PRODUCTION" : "DEVELOPMENT"}`);
  console.log(`NODE_ENV: ${process.env.NODE_ENV}`);
  if (!isProd) {
    console.log("Running in DEVELOPMENT mode with Vite middleware");
    try {
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: "spa"
      });
      app.use(vite.middlewares);
    } catch (err) {
      console.error("Failed to start Vite middleware, falling back to static:", err);
      serveStatic(app);
    }
  } else {
    console.log("Running in PRODUCTION mode serving static files");
    serveStatic(app);
  }
  app.use((err, req, res, next) => {
    console.error("Unhandled Server Error:", err);
    res.status(500).json({ error: "Erro interno do servidor", details: err.message });
  });
  setInterval(() => {
    console.log(`Server heartbeat - ${(/* @__PURE__ */ new Date()).toISOString()} - Mode: ${process.env.NODE_ENV}`);
  }, 6e4);
}
function serveStatic(app) {
  let distPath = path.resolve(__dirname, "dist");
  if (!fs.existsSync(distPath)) {
    distPath = path.resolve(__dirname, "..", "dist");
  }
  if (fs.existsSync(distPath)) {
    console.log(`Serving static files from: ${distPath}`);
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      console.log(`Serving index.html for: ${req.url}`);
      res.sendFile(path.resolve(distPath, "index.html"));
    });
  } else {
    console.error("Static dist folder not found. Checked:", path.resolve(__dirname, "dist"), "and", path.resolve(__dirname, "..", "dist"));
    console.log("Current directory contents:", fs.readdirSync(__dirname));
    app.get("*", (req, res) => {
      res.status(200).send(`Servidor ativo, mas a pasta 'dist' n\xE3o foi encontrada. Diret\xF3rio atual: ${__dirname}. Conte\xFAdo: ${fs.readdirSync(__dirname).join(", ")}`);
    });
  }
}
startServer().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
