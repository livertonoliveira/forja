// negative fixture: axios call with explicit timeout
import axios from 'axios';

async function fetchUser(id: string) {
  const response = await axios.get(`/api/users/${id}`, { timeout: 5000 });
  return response.data;
}

export { fetchUser };
