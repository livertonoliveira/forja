import { Router } from 'express';
import { User } from './models';

const router = Router();

// IDOR — no ownership check
router.get('/items/:id', async (req, res) => {
  const item = await User.findById(req.params.id);
  res.json(item);
});

// Mass assignment
router.post('/users', async (req, res) => {
  const user = await User.create(req.body);
  res.json(user);
});

export default router;
