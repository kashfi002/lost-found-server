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

async function run() {
 async function run() {
  try {
    console.log("Starting MongoDB connection...");

    await client.connect();

    console.log("MongoDB connected!");

    const db = client.db("lostFoundDB");
    const itemsCollection = db.collection("items");
    const reviewsCollection = db.collection("reviews");

    app.get("/hello", (req, res) => {
      res.send("Hello after MongoDB");
    });

    // your other routes...

  } catch (err) {
    console.error("MongoDB Error:", err);
  }
}
}
run().catch(console.dir);

app.get('/',(req,res)=>{
    res.send('Hello World');
});

app.listen(port,()=>{
    console.log(`Server is running on port ${port}`);
});