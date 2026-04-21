// positive fixture: triggers multiple MongoDB heuristics
// unbounded-array, push-without-slice, write-concern, collection-scan,
// regex-unanchored, fulltext-no-text-index, upsert-no-unique-index, connection-pool
import mongoose, { Schema, model } from 'mongoose';

// connection-pool: mongoose.connect without maxPoolSize
// replicaSet: rs0 — connects to a replica set named rs0
mongoose.connect('mongodb://localhost:27017/myapp?replicaSet=rs0');

const commentSchema = new Schema({
  text: String,
  // unbounded-array: no size limit on array fields
  tags: [String],
  history: [{ event: String, ts: Date }],
});

// unbounded-array: no maxlength or validator on nested array
const postSchema = new Schema({
  title: String,
  body: String,
  slug: String,
  // unbounded-array: embedded document array with no limit
  comments: [commentSchema],
});

export const Post = model('Post', postSchema);

// push-without-slice: $push without $slice allows unbounded array growth
async function addComment(postId: string, comment: object) {
  await Post.updateOne({ _id: postId }, { $push: { comments: comment } });
}

// write-concern: w:0 means fire-and-forget, data loss risk
async function savePost(data: object) {
  await Post.create(data, { writeConcern: { w: 0 } });
}

// collection-scan: empty filter {} causes full collection scan
async function getAllPosts() {
  return Post.find({});
}

// regex-unanchored: $regex without ^ anchor cannot use index
async function searchByTitle(term: string) {
  return Post.find({ title: { $regex: term } });
}

// fulltext-no-text-index: $text search without a text index declared on schema
async function searchContent(query: string) {
  return Post.find({ $text: { $search: query } });
}

// upsert-no-unique-index: upsert on a field with no unique index risks duplicate documents
async function upsertPost(slug: string, data: object) {
  await Post.updateOne({ slug }, { $set: data }, { upsert: true });
}
