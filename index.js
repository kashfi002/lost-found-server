require('dotenv').config();
const { MongoClient, ServerApiVersion } = require('mongodb');
const express=require('express');
cors = require('cors');
const app=express();
const port=5000;
const uri = process.env.MONGODB_URI;
app.use(express.json());
app.use(cors());
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});
app.get("/test", (req, res) => {
  res.send("Test route works");
});
async function run() {
  try {
   
    await client.connect();
   const db = client.db("lostFoundDB");
    const itemsCollection = db.collection("items");

    app.post('/items', async (req, res) => {
        const item = req.body;
        const result = await itemsCollection.insertOne(item);
        res.send(result);
    });

    app.get('/items', async (req, res) => {
  try {
    const items = await itemsCollection.find({}).toArray();
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch items' });
  }
})
;
const reviewsCollection = db.collection("reviews");

app.post('/reviews', async (req, res) => {
  try {
    const review = { ...req.body, createdAt: new Date() }
    const result = await reviewsCollection.insertOne(review)
    res.json(result)
  } catch (err) {
    res.status(500).json({ error: 'Failed to save review' })
  }
})

app.get('/reviews', async (req, res) => {
  try {
    const reviews = await reviewsCollection.find({}).sort({ createdAt: -1 }).toArray()
    res.json(reviews)
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch reviews' })
  }
})


    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
   
  }
}
run().catch(console.dir);

app.get('/',(req,res)=>{
    res.send('Hello World');
});

app.listen(port,()=>{
    console.log(`Server is running on port ${port}`);
});