// negative fixture: clean MongoDB code — should NOT trigger any heuristics
import mongoose, { Schema, model } from 'mongoose';

// connection-pool: maxPoolSize configured — safe
mongoose.connect('mongodb://localhost:27017/myapp', { maxPoolSize: 10 });

const tagSchema = new Schema({
  name: { type: String, maxlength: 50 },
});

const postSchema = new Schema({
  title: { type: String, index: true },
  body: String,
  slug: String,
  // bounded array: validator enforces max 20 tags — no unbounded growth
  tags: {
    type: [tagSchema],
    validate: [(arr: unknown[]) => arr.length <= 20, 'Max 20 tags'],
  },
});

// upsert-no-unique-index: unique index declared — upsert is safe
postSchema.index({ slug: 1 }, { unique: true });

export const Post = model('Post', postSchema);

// push-without-slice: $slice keeps array bounded — safe
async function addTag(postId: string, tag: object) {
  await Post.updateOne(
    { _id: postId },
    { $push: { tags: { $each: [tag], $slice: -20 } } },
  );
}

// collection-scan: specific filter on indexed field — not a full scan
async function getPostsByAuthor(authorId: string) {
  return Post.find({ authorId }).maxTimeMS(5000);
}

// regex-unanchored: ^ anchor allows index prefix scan — safe
async function searchBySlug(prefix: string) {
  return Post.find({ slug: { $regex: `^${prefix}` } });
}

// write-concern: default w:1 (majority) — no data-loss risk
async function createPost(data: object) {
  return Post.create(data);
}
