import express from "express";
import Stripe from "stripe";
import admin from "firebase-admin";
import { getFirestore } from "firebase-admin/firestore";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// --- CONFIGURATION & INITIALIZATION ---

// Stripe Initialization (Lazy)
let stripeClient: Stripe | null = null;
function getStripe() {
  if (!stripeClient) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error("STRIPE_SECRET_KEY is not defined in environment variables.");
    stripeClient = new Stripe(key, { apiVersion: "2024-06-20" as any });
  }
  return stripeClient;
}

// Firebase Initialization (Safe)
let db: any;
function initFirebase() {
  if (db) return db;
  try {
    const configPath = fs.existsSync(path.join(__dirname, "firebase-applet-config.json"))
      ? path.join(__dirname, "firebase-applet-config.json")
      : path.join(__dirname, "..", "firebase-applet-config.json");
    
    const firebaseConfig = fs.existsSync(configPath) ? JSON.parse(fs.readFileSync(configPath, "utf8")) : {};
    if (!admin.apps.length) {
      admin.initializeApp({ projectId: firebaseConfig.projectId });
    }
    db = getFirestore(admin.app(), firebaseConfig.firestoreDatabaseId);
    console.log("FIREBASE: Initialized successfully");
    return db;
  } catch (e) {
    console.error("FIREBASE: Initialization failed", e);
    return null;
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

  // 2. Stripe Webhook (MUST be before express.json())
  app.post("/api/webhook", express.raw({ type: "application/json" }), async (req, res) => {
    const sig = req.headers["stripe-signature"] as string;
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    
    if (!webhookSecret) {
      console.error("WEBHOOK: STRIPE_WEBHOOK_SECRET is missing");
      return res.status(500).json({ error: "Webhook secret missing" });
    }

    try {
      const stripe = getStripe();
      const event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);

      if (event.type === "checkout.session.completed") {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.metadata?.userId;
        
        if (userId) {
          console.log(`WEBHOOK: Payment success for user ${userId}`);
          const firestore = initFirebase();
          if (firestore) {
            const userRef = firestore.collection("users").doc(userId);
            const thirtyDaysInMs = 30 * 24 * 60 * 60 * 1000;
            const userDoc = await userRef.get();
            
            let newPremiumUntil: Date;
            if (userDoc.exists) {
              const userData = userDoc.data();
              const currentPremiumUntil = userData?.premiumUntil?.toDate?.() || new Date(0);
              newPremiumUntil = currentPremiumUntil > new Date() 
                ? new Date(currentPremiumUntil.getTime() + thirtyDaysInMs) 
                : new Date(Date.now() + thirtyDaysInMs);
            } else {
              newPremiumUntil = new Date(Date.now() + thirtyDaysInMs);
            }

            await userRef.set({
              isPremium: true,
              premiumUntil: admin.firestore.Timestamp.fromDate(newPremiumUntil),
              premiumSince: admin.firestore.FieldValue.serverTimestamp(),
            }, { merge: true });
            console.log(`WEBHOOK: User ${userId} updated to Premium until ${newPremiumUntil}`);
          }
        }
      }
      res.json({ received: true });
    } catch (err: any) {
      console.error(`WEBHOOK ERROR: ${err.message}`);
      res.status(400).send(`Webhook Error: ${err.message}`);
    }
  });

  // 3. Body Parsers
  app.use(express.json());

  // 4. API Routes (Defined directly on app for maximum reliability)
  const apiRouter = express.Router();

  apiRouter.get("/health", (req, res) => {
    res.json({ 
      status: "ok", 
      timestamp: new Date().toISOString(), 
      initialized: !!db,
      stripe: {
        hasSecretKey: !!process.env.STRIPE_SECRET_KEY,
        hasWebhookSecret: !!process.env.STRIPE_WEBHOOK_SECRET,
        hasPublishableKey: !!process.env.VITE_STRIPE_PUBLISHABLE_KEY
      }
    });
  });

  apiRouter.post("/create-checkout-session", async (req, res) => {
    console.log("API_CALL: create-checkout-session - START");
    const { userId } = req.body;
    
    if (!userId) {
      console.warn("API_CALL: create-checkout-session - Missing userId");
      return res.status(400).json({ error: "User ID is required" });
    }

    try {
      const stripe = getStripe();
      const origin = req.headers.origin || process.env.VITE_APP_URL || "http://localhost:3000";
      console.log(`API_CALL: create-checkout-session - Origin: ${origin}, User: ${userId}`);
      
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ["card", "boleto"],
        payment_method_options: {
          boleto: {
            expires_after_days: 3,
          },
        },
        line_items: [{
          price_data: {
            currency: "brl",
            product_data: { 
              name: "Plano Premium Mensal - Confissões",
              description: "Acesso a fotos no chat, selo premium e suporte prioritário."
            },
            unit_amount: 1499,
          },
          quantity: 1,
        }],
        mode: "payment",
        success_url: `${origin}?payment=success`,
        cancel_url: `${origin}?payment=cancel`,
        metadata: { userId },
      });

      console.log(`API_CALL: create-checkout-session - SUCCESS: ${session.id}`);
      res.json({ id: session.id, url: session.url });
    } catch (error: any) {
      console.error("API_CALL: create-checkout-session - ERROR:", error);
      res.status(500).json({ error: error.message });
    }
  });

  apiRouter.post("/send-chat-message", async (req, res) => {
    console.log("API_CALL: send-chat-message - START");
    const { chatId, text, senderId, imageUrl } = req.body;
    if (!chatId || !senderId || (!text && !imageUrl)) {
      return res.status(400).json({ error: "Campos obrigatórios faltando." });
    }

    const firestore = initFirebase();
    if (!firestore) return res.status(500).json({ error: "Database not initialized" });

    try {
      const chatRef = firestore.collection("chats").doc(chatId);
      const chatDoc = await chatRef.get();
      if (!chatDoc.exists) return res.status(404).json({ error: "Chat não encontrado." });

      const chatData = chatDoc.data();
      const recipientId = chatData?.participants?.find((id: string) => id !== senderId);
      if (!recipientId) return res.status(400).json({ error: "Destinatário não encontrado." });

      const messageRef = chatRef.collection("messages").doc();
      const now = admin.firestore.FieldValue.serverTimestamp();

      await firestore.runTransaction(async (transaction: any) => {
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

      console.log(`API_CALL: send-chat-message - SUCCESS: ${messageRef.id}`);
      res.json({ success: true, messageId: messageRef.id });
    } catch (error: any) {
      console.error("API_CALL: send-chat-message - ERROR:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Catch-all for undefined API routes
  apiRouter.all("*", (req, res) => {
    console.warn(`API_CALL: Route not found - ${req.method} ${req.url}`);
    res.status(404).json({ error: "API Route not found", method: req.method, path: req.url });
  });

  app.use("/api", apiRouter);

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
    // Use absolute path for express.static
    app.use(express.static(distPath, {
      maxAge: '1d',
      etag: true
    }));
    
    app.get("*", (req, res) => {
      // 1. Ignore API routes
      if (req.url.startsWith("/api/")) {
        return res.status(404).json({ error: `API route not found: ${req.url}` });
      }
      
      // 2. Ignore missing assets (don't serve index.html for .js, .css, etc.)
      const isAsset = /\.(js|css|png|jpg|jpeg|gif|svg|ico|json|webmanifest)$/.test(req.url.split('?')[0]);
      if (isAsset) {
        console.warn(`SERVER: Asset not found: ${req.url}`);
        return res.status(404).send("Asset not found");
      }

      // 3. Serve index.html for SPA routes
      if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
      } else {
        // This should theoretically not happen if distExists was true, 
        // but we handle it just in case of disk changes
        console.error(`SERVER ERROR: index.html disappeared from ${indexPath}`);
        res.status(500).send("Application error: index.html missing.");
      }
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
