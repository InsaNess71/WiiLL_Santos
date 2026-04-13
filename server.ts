import express from "express";
import { createServer as createViteServer } from "vite";
import Stripe from "stripe";
import admin from "firebase-admin";
import { getFirestore } from "firebase-admin/firestore";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load Firebase Config
const firebaseConfig = JSON.parse(fs.readFileSync(path.join(__dirname, "firebase-applet-config.json"), "utf8"));

// Initialize Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp({
    projectId: firebaseConfig.projectId,
  });
}

// Lazy Stripe initialization
let stripeClient: Stripe | null = null;
function getStripe() {
  if (!stripeClient) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key || key.trim() === "") {
      throw new Error("A chave secreta do Stripe (STRIPE_SECRET_KEY) não foi configurada. Adicione-a nas configurações do projeto.");
    }
    stripeClient = new Stripe(key, {
      apiVersion: "2024-06-20" as any,
    });
  }
  return stripeClient;
}

async function startServer() {
  console.log("Starting server...");
  
  // Initialize Firestore Admin
  const db = getFirestore(admin.app(), firebaseConfig.firestoreDatabaseId);
  console.log("Firestore Admin initialized.");

  if (!process.env.STRIPE_SECRET_KEY) {
    console.warn("WARNING: STRIPE_SECRET_KEY is not set. Payments will fail.");
  }

  const app = express();
  const PORT = 3000;

  // Middleware
  app.use(express.json());

  // API routes
  console.log("Registering API routes...");

  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // Stripe Webhook (needs raw body)
  app.post("/api/webhook", express.raw({ type: "application/json" }), async (req, res) => {
    const sig = req.headers["stripe-signature"] as string;
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    const sharedWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET_SHARED; // New variable for shared app
    
    if (!webhookSecret) {
      console.error("STRIPE_WEBHOOK_SECRET is missing");
      return res.status(500).send("Webhook secret missing");
    }

    let event;
    const stripe = getStripe();

    try {
      // Try with primary secret
      event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } catch (err: any) {
      // If primary fails and we have a shared secret, try with that
      if (sharedWebhookSecret) {
        try {
          event = stripe.webhooks.constructEvent(req.body, sig, sharedWebhookSecret);
        } catch (secondErr: any) {
          console.error(`Webhook Error (Shared): ${secondErr.message}`);
          return res.status(400).send(`Webhook Error: ${secondErr.message}`);
        }
      } else {
        console.error(`Webhook Error: ${err.message}`);
        return res.status(400).send(`Webhook Error: ${err.message}`);
      }
    }

    // Handle the event
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
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
        
        const thirtyDaysInMs = 30 * 24 * 60 * 60 * 1000;
        let newPremiumUntil: Date;

        if (userDoc.exists) {
          const userData = userDoc.data();
          const currentPremiumUntil = userData?.premiumUntil?.toDate?.() || new Date(0);
          
          if (currentPremiumUntil > new Date()) {
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
            premiumSince: admin.firestore.FieldValue.serverTimestamp(),
          });
        });
        
        console.log(`User ${userId} premium extended until ${newPremiumUntil.toISOString()}`);
      }
    }

    res.json({ received: true });
  });

  // Create Checkout Session
  app.post("/api/create-checkout-session", async (req, res) => {
    console.log("POST /api/create-checkout-session", req.body);
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ error: "User ID is required" });
    }

    try {
      const stripe = getStripe();
      const origin = req.headers.origin || process.env.VITE_APP_URL || 'http://localhost:3000';
      
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ["card", "boleto"],
        payment_method_options: {
          boleto: {
            expires_after_days: 3,
          },
        },
        line_items: [
          {
            price_data: {
              currency: "brl",
              product_data: {
                name: "Plano Premium Mensal - Confissões",
                description: "30 dias de acesso a fotos e recursos exclusivos.",
              },
              unit_amount: 1499, // R$ 14,99
            },
            quantity: 1,
          },
        ],
        mode: "payment",
        success_url: `${origin}?payment=success`,
        cancel_url: `${origin}?payment=cancel`,
        metadata: {
          userId: userId,
        },
      });

      res.json({ id: session.id, url: session.url });
    } catch (error: any) {
      console.error("Stripe Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // API to send chat message with push notification
  app.post("/api/send-chat-message", async (req, res) => {
    const { chatId, text, senderId, imageUrl } = req.body;

    if (!chatId || !senderId || (!text && !imageUrl)) {
      return res.status(400).json({ error: "Campos obrigatórios faltando." });
    }

    try {
      // 1. Security Check: Verify if the sender is who they say they are
      // In a production app, you'd verify the Firebase ID Token here
      // const decodedToken = await admin.auth().verifyIdToken(idToken);
      // if (decodedToken.uid !== senderId) throw new Error("Não autorizado");

      const chatRef = db.collection("chats").doc(chatId);
      const chatDoc = await chatRef.get();

      if (!chatDoc.exists) {
        return res.status(404).json({ error: "Chat não encontrado." });
      }

      const chatData = chatDoc.data();
      const participants = chatData?.participants || [];
      const recipientId = participants.find((id: string) => id !== senderId);

      if (!recipientId) {
        return res.status(400).json({ error: "Destinatário não encontrado." });
      }

      // 2. Atomic Transaction: Save message and update chat metadata
      const messageRef = chatRef.collection("messages").doc();
      const now = admin.firestore.FieldValue.serverTimestamp();

      await db.runTransaction(async (transaction) => {
        // Save the message
        transaction.set(messageRef, {
          senderId,
          text: text || "",
          imageUrl: imageUrl || null,
          createdAt: now,
          isSystem: false
        });

        // Update chat metadata and increment unread count for recipient
        const unreadKey = `unreadCount.${recipientId}`;
        transaction.update(chatRef, {
          lastMessage: text || "📷 Foto",
          updatedAt: now,
          [unreadKey]: admin.firestore.FieldValue.increment(1)
        });
      });

      // 3. Send Push Notification (Async - don't block the response)
      const sendPush = async () => {
        try {
          // Get recipient's FCM token from private data
          const privateDataDoc = await db.collection("users").doc(recipientId).collection("private").doc("data").get();
          const fcmToken = privateDataDoc.data()?.fcmToken;

          if (fcmToken) {
            const senderDoc = await db.collection("users").doc(senderId).get();
            const senderName = senderDoc.data()?.nickname || "Alguém";

            const message = {
              notification: {
                title: senderName,
                body: text || "Enviou uma foto",
              },
              data: {
                chatId: chatId,
                type: "chat_message",
                click_action: "FLUTTER_NOTIFICATION_CLICK" // For mobile compatibility
              },
              token: fcmToken,
            };

            await admin.messaging().send(message);
            console.log(`Push notification sent to ${recipientId}`);
          }
        } catch (pushErr) {
          console.error("Error sending push notification:", pushErr);
        }
      };

      sendPush(); // Fire and forget

      res.json({ success: true, messageId: messageRef.id });
    } catch (error: any) {
      console.error("Chat API Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // 404 handler for API
  app.use("/api/*", (req, res) => {
    console.log(`404 at ${req.originalUrl}`);
    res.status(404).json({ error: `Rota API não encontrada: ${req.originalUrl}` });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    console.log("Running in DEVELOPMENT mode with Vite middleware");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    console.log("Running in PRODUCTION mode serving static files");
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer().catch(err => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
