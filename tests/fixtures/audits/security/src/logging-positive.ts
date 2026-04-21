import { Router } from 'express';
import { logger } from './logger';

const router = Router();

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  logger.info(`Login attempt: ${email} ${password}`);

  const user = await findUser(email, password);
  res.json({ id: user.id, email: user.email, password: user.password, token: user.token });
});

export default router;
