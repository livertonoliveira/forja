// positive fixture: axios call without timeout
import axios from 'axios';

async function fetchUser(id: string) {
  const response = await axios.get(`/api/users/${id}`);
  return response.data;
}

export { fetchUser };
