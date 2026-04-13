import express from "express";
import { createServer as createViteServer } from "vite";
import Stripe from "stripe";
import admin from "firebase-admin";
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

const db = admin.firestore();

// Lazy Stripe initialization
let stripeClient: Stripe | null = null;
function getStripe() {
  if (!stripeClient) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) {
      throw new Error("STRIPE_SECRET_KEY is missing. Please add it to your environment variables.");
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

      if (userId) {
        console.log(`Payment successful for user: ${userId}`);
        const thirtyDaysInMs = 30 * 24 * 60 * 60 * 1000;
        const premiumUntil = new Date(Date.now() + thirtyDaysInMs);
        
        await db.collection("users").doc(userId).update({
          isPremium: true,
          premiumUntil: admin.firestore.Timestamp.fromDate(premiumUntil),
          premiumSince: admin.firestore.FieldValue.serverTimestamp(),
        });
      }
    }

    res.json({ received: true });
  });

  app.use(express.json());

  // Create Checkout Session
  app.post("/api/create-checkout-session", async (req, res) => {
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

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
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

startServer();
