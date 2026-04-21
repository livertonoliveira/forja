// positive fixture: triggers regex-unanchored heuristic
// Uses $regex with literal regex (/pattern/) and string ("pattern") without ^ anchor
import { MongoClient } from 'mongodb';

const client = new MongoClient('mongodb://localhost:27017');
const db = client.db('myapp');

// REGEX_LITERAL match: $regex: /term/ — unanchored literal, no ^ prefix
async function searchByTitle(term: string) {
  return db.collection('posts').find({ title: { $regex: /term/ } }).toArray();
}

// REGEX_STRING match: $regex: "someword" — unanchored string, no ^ prefix
async function searchBySlug() {
  return db.collection('articles').find({ slug: { $regex: "someword" } }).toArray();
}

// Anchored regex — should NOT trigger the heuristic
async function searchByPrefix() {
  return db.collection('posts').find({ title: { $regex: /^prefix/ } }).toArray();
}
