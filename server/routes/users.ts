import { Router } from 'express';
import { dbAll, dbGet, dbRun } from '../database.js';
import { authenticateToken } from './auth.js';

const router = Router();
router.use(authenticateToken);

router.get('/search', async (req: any, res) => {
  const query = req.query.query;
  const userId = req.user.id;
  
  console.log(`[Search] User ID ${userId} searching for "${query}"`);
  
  try {
    const users = await dbAll(`
      SELECT id, email, nickname, is_bot, public_key FROM users 
      WHERE (LOWER(email) LIKE LOWER($1) OR LOWER(nickname) LIKE LOWER($2)) AND id != $3
      LIMIT 10
    `, `%${query}%`, `%${query}%`, userId);
    
    console.log(`[Search] Found ${users.length} users. Results:`, users.map((u: any) => u.nickname));
    res.json(users);
  } catch (error) {
    console.error('Search users error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/public-key', async (req: any, res) => {
  const { publicKey } = req.body;
  const userId = req.user.id;
  
  try {
    await dbRun('UPDATE users SET public_key = $1 WHERE id = $2', publicKey, userId);
    res.json({ success: true });
  } catch (error) {
    console.error('Update public key error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:id/public-key', async (req: any, res) => {
  const targetId = req.params.id;
  
  try {
    const user = await dbGet('SELECT public_key FROM users WHERE id = $1', targetId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ publicKey: user.public_key });
  } catch (error) {
    console.error('Get public key error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export const userRoutes = router;
