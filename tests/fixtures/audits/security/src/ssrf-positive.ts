import { Router } from 'express';
import axios from 'axios';

const router = Router();

// SSRF via user-controlled URL
router.get('/proxy', async (req, res) => {
  const data = await axios.get(req.query.url as string);
  res.json(data.data);
});

router.post('/webhook', async (req, res) => {
  const result = await fetch(`https://hooks.example.com/${req.body.endpoint}`);
  res.json(await result.json());
});

export default router;
