// lib/auth.js
import { betterAuth } from "better-auth";
import { MongoClient } from "mongodb";
import { mongodbAdapter } from "better-auth/adapters/mongodb";

const client = new MongoClient(process.env.MONGODB_URI);
await client.connect();
const db = client.db("lost-users");

export const auth = betterAuth({
  database: mongodbAdapter(db, { client }),
  emailAndPassword: { enabled: true },
  trustedOrigins: [
    "http://localhost:5173",
    "https://lost-found-liart-five.vercel.app",
  ],
});