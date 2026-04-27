// negative fixture: batch fetch — safe, uses a single batched query
async function loadUserPosts(userIds: string[]) {
  const posts = await postRepository.findMany({ where: { authorId: { in: userIds } } });
  console.log(posts);
}
