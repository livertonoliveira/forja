import express from 'express';
import cors from 'cors';

const app = express();

// CORS wildcard
app.use(cors({ origin: '*' }));

// Debug mode
const config = {
  debug: true,
  port: 3000,
};

// Stack trace in response
app.use((err: Error, req: any, res: any, next: any) => {
  res.status(500).json({ error: err.message, stack: err.stack });
});

export default app;
