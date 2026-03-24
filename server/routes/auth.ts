import { Router } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { dbGet, dbRun } from '../database.js';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-key';
if (!process.env.JWT_SECRET) {
  console.warn('WARNING: JWT_SECRET env variable is missing. Using fallback for development.');
}

const registerSchema = z.object({
  email: z.string().email(),
  nickname: z.string().min(1).max(20),
  password: z.string().min(6)
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string()
});

router.post('/register', async (req, res) => {
  try {
    const { email, nickname, password } = registerSchema.parse(req.body);
    
    const passwordHash = await bcrypt.hash(password, 10);
    const result = await dbRun(
      'INSERT INTO users (email, nickname, password_hash) VALUES ($1, $2, $3) RETURNING id',
      email, nickname, passwordHash
    );
    
    const userId = result.rows[0].id;
    const token = jwt.sign({ id: userId, email, nickname }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id: userId, email, nickname } });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.issues[0].message });
    }
    if (error.code === '23505') { // PostgreSQL unique violation
      return res.status(400).json({ error: 'Email или никнейм уже существуют' });
    }
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = loginSchema.parse(req.body);
    
    const user = await dbGet('SELECT * FROM users WHERE email = $1', email);
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ error: 'Неверные учетные данные' });
    }
    
    const token = jwt.sign({ id: user.id, email: user.email, nickname: user.nickname }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id: user.id, email: user.email, nickname: user.nickname } });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.issues[0].message });
    }
    console.error('Login error:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

export const authRoutes = router;
export function authenticateToken(req: any, res: any, next: any) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.sendStatus(401);

  jwt.verify(token, JWT_SECRET, (err: any, user: any) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
}
