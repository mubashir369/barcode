import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI;
if (!uri) throw new Error("Missing MONGODB_URI in .env.local");

declare global {
  // eslint-disable-next-line no-var
  var _mongoClientPromise: Promise<MongoClient> | undefined;
}

// Reuse one client across hot reloads (dev) and warm invocations (prod).
const clientPromise: Promise<MongoClient> =
  global._mongoClientPromise ?? new MongoClient(uri).connect();

if (process.env.NODE_ENV !== "production") {
  global._mongoClientPromise = clientPromise;
}

export async function getStockCollection() {
  const client = await clientPromise;
  const dbName = process.env.MONGODB_DB_NAME;
  if (!dbName) throw new Error("Missing MONGODB_DB_NAME in .env.local");
  return client
    .db(dbName)
    .collection(process.env.MONGODB_COLLECTION_NAME || "stocks");
}

export default clientPromise;