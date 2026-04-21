import { Router } from 'express';
import { db } from './db';

const router = Router();

// SQL injection via string interpolation
router.get('/users', async (req, res) => {
  const name = req.query.name;
  const result = await db.query(`SELECT * FROM users WHERE name = '${name}'`);
  res.json(result);
});

// NoSQL injection
router.post('/login', async (req, res) => {
  const user = await db.findOne({ email: req.body.email, password: req.body.password });
  res.json(user);
});

// Command injection
import { exec } from 'child_process';
router.get('/ping', (req, res) => {
  exec(`ping -c 1 ${req.query.host}`, (err, stdout) => {
    res.send(stdout);
  });
});

// XSS
router.get('/render', (req, res) => {
  res.send(`<div id="content"></div><script>document.getElementById('content').innerHTML = '${req.query.data}'</script>`);
});

export default router;
