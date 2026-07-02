require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion } = require('mongodb');

const app = express();
const uri = process.env.MONGODB_URI;

// Middleware
app.use(express.json());
app.use(cors());

// MongoDB Client Setup (Cached connection for Serverless)
let client;
let db;

async function connectDB() {
  if (db) return db;
  if (!client) {
    client = new MongoClient(uri, {
      serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
      }
    });
  }
  await client.connect();
  db = client.db("lostFoundDB");
  return db;
}

// ==================== Items Routes ====================

app.post('/api/items', async (req, res) => {
  try {
    const database = await connectDB();
    const itemsCollection = database.collection("items");
    const item = req.body;
    const result = await itemsCollection.insertOne(item);
    res.status(201).json(result);
  } catch (err) {
    res.status(500).json({ error: 'Failed to save item', details: err.message });
  }
});

app.get('/api/items', async (req, res) => {
  try {
    const database = await connectDB();
    const itemsCollection = database.collection("items");
    const items = await itemsCollection.find({}).toArray();
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch items' });
  }
});

// ==================== Reviews Routes ====================

app.post('/api/reviews', async (req, res) => {
  try {
    const database = await connectDB();
    const reviewsCollection = database.collection("reviews");
    const review = { ...req.body, createdAt: new Date() };
    const result = await reviewsCollection.insertOne(review);
    res.status(201).json(result);
  } catch (err) {
    res.status(500).json({ error: 'Failed to save review' });
  }
});

app.get('/api/reviews', async (req, res) => {
  try {
    const database = await connectDB();
    const reviewsCollection = database.collection("reviews");
    const reviews = await reviewsCollection.find({}).sort({ createdAt: -1 }).toArray();
    res.json(reviews);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch reviews' });
  }
});

// Base Routes
app.get('/api', (req, res) => {
  res.send('Hello World from Vercel Serverless!');
});

app.get("/api/test", (req, res) => {
  res.send("Test route works");
});

// Export the app for Vercel
module.exports = app;