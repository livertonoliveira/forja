// negative fixture: clean aggregation code — should NOT trigger any heuristics
import { MongoClient } from 'mongodb';

// connection-pool: maxPoolSize configured — safe
const client = new MongoClient('mongodb://localhost:27017', { maxPoolSize: 20 });
const db = client.db('myapp');

// lookup-missing-index + collection-scan: $match is the first stage (filters early),
// and foreignField 'userId' has an index declared on the users collection
async function getActiveOrdersWithUsers() {
  return db.collection('orders').aggregate([
    { $match: { status: 'active' } },
    { $lookup: { from: 'users', localField: 'userId', foreignField: 'userId', as: 'user' } },
  ]).toArray();
}

// in-large: small, inline, bounded array — no risk of oversized $in
async function getByStatuses() {
  return db.collection('orders').find({
    status: { $in: ['pending', 'active', 'shipped'] },
  }).maxTimeMS(5000).toArray();
}

// slow-query: maxTimeMS present — query has a timeout guard
async function findByEmail(email: string) {
  return db.collection('users').findOne({ email }, { maxTimeMS: 3000 });
}

// missing-index: hint explicitly provides the index to use
async function findActiveProducts() {
  return db.collection('products')
    .find({ active: true })
    .hint({ active: 1 })
    .maxTimeMS(5000)
    .toArray();
}
