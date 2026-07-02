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

async function run() {
  try {
    // Connect to MongoDB
    await client.connect();
    const db = client.db("lostFoundDB");
    const itemsCollection = db.collection("items");
    const reviewsCollection = db.collection("reviews");

    // ==================== Items Routes ====================
    
    // Create an item
    app.post('/items', async (req, res) => {
      try {
        const item = req.body;
        const result = await itemsCollection.insertOne(item);
        res.status(201).send(result);
      } catch (err) {
        res.status(500).json({ error: 'Failed to save item' });
      }
    });

    // Get all items
    app.get('/items', async (req, res) => {
      try {
        const items = await itemsCollection.find({}).toArray();
        res.json(items);
      } catch (err) {
        res.status(500).json({ error: 'Failed to fetch items' });
      }
    });

    // ==================== Reviews Routes ====================

    // Create a review
    app.post('/reviews', async (req, res) => {
      try {
        const review = { ...req.body, createdAt: new Date() };
        const result = await reviewsCollection.insertOne(review);
        res.status(201).json(result);
      } catch (err) {
        res.status(500).json({ error: 'Failed to save review' });
      }
    });

    // Get all reviews (sorted by newest)
    app.get('/reviews', async (req, res) => {
      try {
        const reviews = await reviewsCollection.find({}).sort({ createdAt: -1 }).toArray();
        res.json(reviews);
      } catch (err) {
        res.status(500).json({ error: 'Failed to fetch reviews' });
      }
    });

    // Ping deployment to confirm connection
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");

  } catch (error) {
    console.error("Database connection error:", error);
  }
}
run().catch(console.dir);

// Base Routes
app.get('/', (req, res) => {
  res.send('Hello World');
});

app.get("/test", (req, res) => {
  res.send("Test route works");
});

// Start Server
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});