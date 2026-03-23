import { Router } from 'express';
import dbModule from '../database.js';
import { authenticateToken } from './auth.js';

const router = Router();
router.use(authenticateToken);

router.get('/search', async (req: any, res) => {
  const query = req.query.query;
  const userId = req.user.id;
  
  console.log(`[Search] User ID ${userId} searching for "${query}"`);
  
  try {
    const db = dbModule.getDb();
    // Case-insensitive search using LOWER()
    const users = await db.all(`
      SELECT id, email, nickname, is_bot, public_key FROM users 
      WHERE (LOWER(email) LIKE LOWER(?) OR LOWER(nickname) LIKE LOWER(?)) AND id != ?
      LIMIT 10
    `, `%${query}%`, `%${query}%`, userId);
    
    console.log(`[Search] Found ${users.length} users. Results:`, users.map(u => u.nickname));
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
    const db = dbModule.getDb();
    await db.run('UPDATE users SET public_key = ? WHERE id = ?', publicKey, userId);
    res.json({ success: true });
  } catch (error) {
    console.error('Update public key error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:id/public-key', async (req: any, res) => {
  const targetId = req.params.id;
  
  try {
    const db = dbModule.getDb();
    const user = await db.get('SELECT public_key FROM users WHERE id = ?', targetId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ publicKey: user.public_key });
  } catch (error) {
    console.error('Get public key error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export const userRoutes = router;
