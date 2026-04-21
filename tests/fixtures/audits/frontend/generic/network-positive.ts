export async function fetchData() {
  const userResponse = await fetch('/api/users');
  const user = await userResponse.json();

  const postsResponse = await fetch('/api/posts');
  const posts = await postsResponse.json();

  return { user, posts };
}
