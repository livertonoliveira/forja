// positive fixture: N+1 query inside forEach
async function loadUserPosts(users: any[]) {
  users.forEach(async (user) => {
    const posts = await postRepository.findMany({ where: { authorId: user.id } });
    console.log(posts);
  });
}
