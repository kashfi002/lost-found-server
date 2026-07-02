require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion } = require('mongodb');

const app = express();
const port = process.env.PORT || 5000;
const uri = process.env.MONGODB_URI;

// Middleware
app.use(express.json());
app.use(cors());

// MongoDB Client Setup
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

// ---- Lazy, reused connection (important for serverless) ----
// On Vercel, a new instance can be spun up per request. We cache the
// connection promise so repeated invocations reuse the same connection
// instead of reconnecting every time, and so routes never fire before
// the connection is ready.
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

// Small helper so every route awaits the DB the same way
async function getCollections() {
  const db = await getDb();
  return {
    itemsCollection: db.collection('items'),
    reviewsCollection: db.collection('reviews'),
  };
}

// ==================== Base Routes ====================
app.get('/', (req, res) => {
  res.send('Hello World');
});

app.get('/test', (req, res) => {
  res.send('Test route works');
});

// ==================== Items Routes ====================

// Create an item
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

// Get all items
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

// Create a review
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

// Get all reviews (sorted by newest)
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

// ---- Local development only ----
// On Vercel this file is imported as a serverless function handler and
// app.listen() is never called. Locally (node index.js / nodemon), this
// starts a normal server exactly like before.
if (require.main === module) {
  app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
  });
}

module.exports = app;