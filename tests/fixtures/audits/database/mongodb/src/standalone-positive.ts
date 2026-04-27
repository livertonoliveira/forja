// positive fixture: triggers aggregation-related MongoDB heuristics
// lookup-missing-index, collection-scan (no early $match), in-large, slow-query (no maxTimeMS), missing-index
import { MongoClient } from 'mongodb';

const client = new MongoClient('mongodb://localhost:27017');
const db = client.db('myapp');

// lookup-missing-index: $lookup on foreignField '_id' without a declared index,
// and $match comes AFTER $lookup instead of being the first stage (collection-scan)
async function getOrdersWithUsers() {
  return db.collection('orders').aggregate([
    { $lookup: { from: 'users', localField: 'userId', foreignField: '_id', as: 'user' } },
    { $match: { status: 'active' } },
  ]).toArray();
}

// collection-scan: no $match stage at all — full collection aggregation
async function summarizeAllOrders() {
  return db.collection('orders').aggregate([
    { $group: { _id: '$status', count: { $sum: 1 } } },
    { $sort: { count: -1 } },
  ]).toArray();
}

// in-large: $in with a dynamic array — risk of >1000 elements at runtime
async function getByIds(ids: string[]) {
  return db.collection('products').find({ _id: { $in: ids } }).toArray();
}

// slow-query: find without maxTimeMS — no query timeout guard
async function findAdmins() {
  return db.collection('users').find({ role: 'admin' }).toArray();
}

// missing-index: findOne on 'email' field with no hint and no declared index visible
async function findByEmail(email: string) {
  return db.collection('users').findOne({ email });
}
