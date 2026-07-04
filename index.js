import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { MongoClient, ServerApiVersion, ObjectId } from 'mongodb';
import { betterAuth } from 'better-auth';
import { mongodbAdapter } from 'better-auth/adapters/mongodb';
import { toNodeHandler } from 'better-auth/node';
import nodemailer from 'nodemailer';
import { computeClaimMatchScore, computeItemMatchScore } from './matching.js';

const app = express();
const port = process.env.PORT || 5000;
const uri = process.env.MONGODB_URI;

const CLAIM_THRESHOLD = 80;
const MATCH_THRESHOLD = 80;

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'lost.found20232026@gmail.com',
    pass: process.env.GMAIL_APP_PASSWORD,
  },
});

// Shared email sender so all routes log/handle failures the same way
async function sendMail({ to, subject, html }) {
  try {
    const info = await transporter.sendMail({
      from: '"Lost & Found Alerts" <lost.found20232026@gmail.com>',
      to,
      subject,
      html,
    });
    console.log(`Email to ${to} sent:`, info.messageId);
    return true;
  } catch (err) {
    console.error(`Email to ${to} failed:`, err);
    return false;
  }
}

// MongoDB Client Setup
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

let dbPromise;
function getDb() {
  if (!dbPromise) {
    dbPromise = client.connect().then(() => {
      console.log('Connected to MongoDB');
      return client.db('lostFoundDB');
    });
  }
  return dbPromise;
}

async function getCollections() {
  const db = await getDb();
  return {
    itemsCollection: db.collection('items'),
    reviewsCollection: db.collection('reviews'),
    claimsCollection: db.collection('claims'),
     donationsCollection: db.collection('donations'),
  };
}
async function getUsersCollection() {
  return authDb.collection('user');
}

// ==================== Better Auth Setup ====================
const authDb = client.db('lost-users');
const auth = betterAuth({
  database: mongodbAdapter(authDb, { client }),
  emailAndPassword: { enabled: true },
  trustedOrigins: [
    'http://localhost:5173',
    'https://lost-found-liart-five.vercel.app',
  ],
});

// ==================== Middleware ====================
app.use(cors({
  origin: 'http://localhost:5173',
  credentials: true,
}));
app.all('/api/auth/{*any}', toNodeHandler(auth));
app.use(express.json());

// ==================== Emergency Alert Route ====================
app.post('/api/emergency-alert', async (req, res) => {
  try {
    const { item, message } = req.body;

    if (!item || !item.product_type) {
      return res.status(400).json({ error: 'Missing item data' });
    }

    const { itemsCollection } = await getCollections();
    const usersCollection = await getUsersCollection();

    const itemToInsert = { ...item, createdAt: new Date() };
    const insertResult = await itemsCollection.insertOne(itemToInsert);

    const users = await usersCollection.find({}, { projection: { email: 1, name: 1 } }).toArray();

    if (!users.length) {
      return res.status(200).json({
        success: true,
        itemId: insertResult.insertedId,
        sent: 0,
        failed: 0,
        warning: 'Item saved but no users found to notify',
      });
    }

    const results = await Promise.all(
      users.map((user) =>
        sendMail({
          to: user.email,
          subject: '⚠️ Emergency Alert',
          html: `
            <h2>Emergency Alert</h2>
            <p>Hi ${user.name || 'there'},</p>
            <p>${message || 'This is an emergency notification from our system.'}</p>
          `,
        })
      )
    );

    const failed = results.filter((ok) => !ok).length;

    res.status(201).json({
      success: true,
      itemId: insertResult.insertedId,
      sent: users.length - failed,
      failed,
    });
  } catch (err) {
    console.error('POST /api/emergency-alert error:', err);
    res.status(500).json({ error: 'Failed to save/send emergency alert' });
  }
});
// ==================== Donation Route (manual bKash verification) ====================
app.post('/api/donations', async (req, res) => {
  try {
    const { itemId, trxId, amount, name } = req.body;

    if (!trxId || trxId.trim().length < 5) {
      return res.status(400).json({ error: 'Please enter a valid Transaction ID' });
    }

    const { donationsCollection } = await getCollections();

    // Prevent the exact same TrxID being submitted twice
    const existing = await donationsCollection.findOne({ trxId: trxId.trim() });
    if (existing) {
      return res.status(409).json({ error: 'This Transaction ID has already been submitted' });
    }

    await donationsCollection.insertOne({
      itemId: itemId || null,
      trxId: trxId.trim(),
      amount: amount || null,
      name: name || 'Anonymous',
      verified: false, // you'll flip this manually after checking your bKash statement
      createdAt: new Date(),
    });

    res.status(201).json({ success: true });
  } catch (err) {
    console.error('POST /api/donations error:', err);
    res.status(500).json({ error: 'Failed to save donation record' });
  }
});

// Optional: an admin-only route to view/verify donations later
app.get('/api/donations', async (req, res) => {
  try {
    const { donationsCollection } = await getCollections();
    const donations = await donationsCollection.find({}).sort({ createdAt: -1 }).toArray();
    res.json(donations);
  } catch (err) {
    console.error('GET /api/donations error:', err);
    res.status(500).json({ error: 'Failed to fetch donations' });
  }
});

// ==================== Match Notification Route ====================
// Called after a new item is saved. Fetches the matched item fresh from DB
// (never trusts client-computed scores), and only emails the original poster
// if the match is genuinely >= MATCH_THRESHOLD.
app.post('/api/notify-match', async (req, res) => {
  try {
    const { newItem, matchedItemId } = req.body;

    if (!newItem || !matchedItemId) {
      return res.status(400).json({ error: 'Missing newItem or matchedItemId' });
    }

    const { itemsCollection } = await getCollections();
    const matchedItem = await itemsCollection.findOne({ _id: new ObjectId(matchedItemId) });

    if (!matchedItem) {
      return res.status(404).json({ error: 'Matched item not found' });
    }

    const { score, sharedKeywords } = computeItemMatchScore(newItem, matchedItem);

    if (score < MATCH_THRESHOLD) {
      return res.status(200).json({ success: true, notified: false, score });
    }

    const posterEmail = matchedItem.contact || matchedItem.contactEmail;
    if (!posterEmail || !posterEmail.includes('@')) {
      return res.status(200).json({ success: true, notified: false, score, warning: 'No valid contact email on matched item' });
    }

    const reporterContact = newItem.contact || newItem.contactEmail || 'not provided';
    const reporterPhone = newItem.phone || newItem.contactMobile || '';

    const sent = await sendMail({
      to: posterEmail,
      subject: `🎯 Possible ${matchedItem.status === 'lost' ? 'match' : 'match'} for your ${matchedItem.status} item`,
      html: `
        <h2>Potential Match Found (${score}% match)</h2>
        <p>Someone just reported a <strong>${newItem.status}</strong> item that may match your <strong>${matchedItem.product_type}</strong> report.</p>
        ${sharedKeywords.length ? `<p><strong>Matched details:</strong> ${sharedKeywords.join(', ')}</p>` : ''}
        <p><strong>Reporter contact:</strong> ${reporterContact}${reporterPhone ? ` / ${reporterPhone}` : ''}</p>
        <p><strong>Location:</strong> ${newItem.place || 'Not specified'}</p>
        <p>Log in to the app to view full details and coordinate.</p>
      `,
    });

    res.status(200).json({ success: true, notified: sent, score });
  } catch (err) {
    console.error('POST /api/notify-match error:', err);
    res.status(500).json({ error: 'Failed to process match notification' });
  }
});

// ==================== Claims Route ====================
// Verifies the claim server-side (can't be tampered with by the client),
// stores the claim, and only emails the original poster if score >= CLAIM_THRESHOLD.
app.post('/api/claims', async (req, res) => {
  try {
    const { itemId, claim } = req.body;

    if (!itemId || !claim || !claim.name || !claim.email || !claim.description) {
      return res.status(400).json({ error: 'Missing required claim fields' });
    }

    const { itemsCollection, claimsCollection } = await getCollections();
    const item = await itemsCollection.findOne({ _id: new ObjectId(itemId) });

    if (!item) {
      return res.status(404).json({ error: 'Item not found' });
    }

    // Rate-limit: max 3 attempts per email per item
    const attemptCount = await claimsCollection.countDocuments({ itemId, claimantEmail: claim.email });
    if (attemptCount >= 3) {
      return res.status(429).json({ error: 'Maximum claim attempts reached for this item' });
    }

    const score = computeClaimMatchScore(item, claim);
    const verified = score >= CLAIM_THRESHOLD;

    await claimsCollection.insertOne({
      itemId,
      claimantEmail: claim.email,
      claimantName: claim.name,
      claimantPhone: claim.phone || '',
      score,
      verified,
      createdAt: new Date(),
    });

    if (verified) {
      const posterEmail = item.contact || item.contactEmail;
      if (posterEmail && posterEmail.includes('@')) {
        await sendMail({
          to: posterEmail,
          subject: `✅ Your ${item.product_type} has been claimed`,
          html: `
            <h2>Claim Verified (${score}% match)</h2>
            <p>Someone has successfully verified ownership of your <strong>${item.product_type}</strong> report.</p>
            <p><strong>Claimant:</strong> ${claim.name}</p>
            <p><strong>Contact:</strong> ${claim.email}${claim.phone ? ` / ${claim.phone}` : ''}</p>
            <p>Please reach out to them to arrange the return.</p>
          `,
        });
      }
    }

    res.status(200).json({
      success: true,
      verified,
      score: verified ? score : undefined, // don't leak exact score on failure
      attemptsRemaining: verified ? undefined : 2 - attemptCount,
    });
  } catch (err) {
    console.error('POST /api/claims error:', err);
    res.status(500).json({ error: 'Failed to process claim' });
  }
});

// ==================== Base Routes ====================
app.get('/', (req, res) => {
  res.send('Hello World');
});
app.get('/test', (req, res) => {
  res.send('Test route works');
});

// ==================== Items Routes ====================
app.post('/items', async (req, res) => {
  try {
    const { itemsCollection } = await getCollections();
    const item = req.body;
    const result = await itemsCollection.insertOne(item);
    res.status(201).send(result);
  } catch (err) {
    console.error('POST /items error:', err);
    res.status(500).json({ error: 'Failed to save item' });
  }
});

app.get('/items', async (req, res) => {
  try {
    const { itemsCollection } = await getCollections();
    const items = await itemsCollection.find({}).toArray();
    res.json(items);
  } catch (err) {
    console.error('GET /items error:', err);
    res.status(500).json({ error: 'Failed to fetch items' });
  }
});

// ==================== Reviews Routes ====================
app.post('/reviews', async (req, res) => {
  try {
    const { reviewsCollection } = await getCollections();
    const review = { ...req.body, createdAt: new Date() };
    const result = await reviewsCollection.insertOne(review);
    res.status(201).json(result);
  } catch (err) {
    console.error('POST /reviews error:', err);
    res.status(500).json({ error: 'Failed to save review' });
  }
});

app.get('/reviews', async (req, res) => {
  try {
    const { reviewsCollection } = await getCollections();
    const reviews = await reviewsCollection.find({}).sort({ createdAt: -1 }).toArray();
    res.json(reviews);
  } catch (err) {
    console.error('GET /reviews error:', err);
    res.status(500).json({ error: 'Failed to fetch reviews' });
  }
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});

export default app;