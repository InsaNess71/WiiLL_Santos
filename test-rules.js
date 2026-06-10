import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { readFileSync } from 'fs';
import * as path from 'path';

let testEnv;

async function run() {
  testEnv = await initializeTestEnvironment({
    projectId: "demo-test",
    firestore: {
      rules: readFileSync(path.resolve('./firestore.rules'), 'utf8'),
      host: 'localhost',
      port: 8080 // Assuming emulator isn't running, but unit testing library handles it
    },
  });

  const alice = testEnv.authenticatedContext('aliceId', { email: 'alice@test.com', email_verified: true });

  const chatId = 'aliceId_bobId';
  
  // Test Creating chat + message in batch
  try {
    const db = alice.firestore();
    const batch = db.batch();
    
    const chatRef = db.doc(`chats/${chatId}`);
    const msgRef = db.collection('chats').doc(chatId).collection('messages').doc('msg1');
    
    // JS dates
    const expiry = new Date();
    expiry.setHours(expiry.getHours() + 24);
    
    batch.set(chatRef, {
      participants: ['aliceId', 'bobId'],
      durationMode: '24h',
      expiresAt: expiry,
      updatedAt: db.app.firebase.firestore.FieldValue.serverTimestamp(),
      lastMessage: 'hello',
      unreadCount: { 'aliceId': 0, 'bobId': 1 }
    });
    
    batch.set(msgRef, {
      senderId: 'aliceId',
      text: 'hello',
      createdAt: db.app.firebase.firestore.FieldValue.serverTimestamp(),
      isSystem: false
    });
    
    await assertSucceeds(batch.commit());
    console.log("Create batch SUCCESS");
    
  } catch (e) {
    console.error("Create batch FAILED", e);
  }

  process.exit();
}

run();
