export async function fetchData() {
  const [userResponse, postsResponse] = await Promise.all([
    fetch('/api/users'),
    fetch('/api/posts'),
  ]);
  const [user, posts] = await Promise.all([
    userResponse.json(),
    postsResponse.json(),
  ]);
  return { user, posts };
}
