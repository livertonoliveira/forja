import jwt from 'jsonwebtoken';
import { Router } from 'express';

const router = Router();
const secret = 'changeme';

// JWT with alg:none
router.post('/token-none', (req, res) => {
  const token = jwt.sign({ userId: req.body.id }, '', { algorithm: 'none' });
  res.json({ token });
});

// Weak secret
router.post('/login', (req, res) => {
  const token = jwt.sign({ userId: 1 }, secret);
  res.json({ token });
});

// Session fixation
router.post('/auth', (req, res) => {
  req.session.userId = req.body.userId;
  req.session.role = 'user';
  res.json({ ok: true });
});

export default router;
