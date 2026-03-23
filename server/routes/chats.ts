import { Router } from 'express';
import { z } from 'zod';
import { dbAll, dbGet, dbRun } from '../database.js';
import { authenticateToken } from './auth.js';

const router = Router();
router.use(authenticateToken);

const createChatSchema = z.object({
  type: z.enum(['private', 'group']),
  name: z.string().optional().nullable(),
  participantIds: z.array(z.number()).min(1),
  encryptedKeys: z.record(z.string(), z.object({
    wrappedKey: z.string(),
    iv: z.string()
  })).optional()
});

router.post('/', async (req: any, res) => {
  try {
    const { type, participantIds, name, encryptedKeys } = createChatSchema.parse(req.body);
    const userId = req.user.id;
    
    const allParticipants = Array.from(new Set([...participantIds, userId]));
    
    // For private chats, check if one already exists
    if (type === 'private' && allParticipants.length === 2) {
      const otherUserId = allParticipants.find(id => id !== userId);
      const existingChat = await dbGet(`
        SELECT c.id, cp.encrypted_key, cp.iv, cp.is_favorite,
        (SELECT u.nickname FROM chat_participants cp2 JOIN users u ON cp2.user_id = u.id WHERE cp2.chat_id = c.id AND cp2.user_id != $1 LIMIT 1) as recipient_username
        FROM chats c
        JOIN chat_participants cp ON c.id = cp.chat_id
        WHERE c.type = 'private' 
        AND cp.user_id = $2
        AND EXISTS (SELECT 1 FROM chat_participants cp3 WHERE cp3.chat_id = c.id AND cp3.user_id = $3)
      `, userId, userId, otherUserId);

      if (existingChat) {
        return res.json(existingChat);
      }
    }

    // Check if all participants exist
    const placeholders = allParticipants.map((_, i) => `$${i + 1}`).join(',');
    const existingUsers = await dbAll(
      `SELECT id FROM users WHERE id IN (${placeholders})`,
      ...allParticipants
    );
    
    if (existingUsers.length !== allParticipants.length) {
      return res.status(400).json({ error: 'Один или несколько участников не существуют' });
    }

    // Encrypted keys validation — skipped while encryption is disabled
    // When encryption is enabled later, uncomment the validation below:
    // if (encryptedKeys) {
    //   const botIds = await dbAll(
    //     `SELECT id FROM users WHERE id IN (${placeholders}) AND is_bot = 1`,
    //     ...allParticipants
    //   );
    //   const botIdSet = new Set(botIds.map((b: any) => b.id));
    //   for (const pid of allParticipants) {
    //     if (botIdSet.has(pid)) continue;
    //     const pidStr = pid.toString();
    //     if (!encryptedKeys[pidStr]) {
    //       return res.status(400).json({ error: `Отсутствует зашифрованный ключ для участника ${pid}` });
    //     }
    //   }
    // }

    const chatResult = await dbRun(
      'INSERT INTO chats (type, name) VALUES ($1, $2) RETURNING id',
      type, name || null
    );
    const chatId = chatResult.rows[0].id;
    
    for (const pId of allParticipants) {
      const keyData = encryptedKeys ? encryptedKeys[pId.toString()] : null;
      await dbRun(
        'INSERT INTO chat_participants (chat_id, user_id, encrypted_key, iv) VALUES ($1, $2, $3, $4)',
        chatId, pId, keyData?.wrappedKey || '', keyData?.iv || ''
      );
    }
    
    const newChat = await dbGet(`
      SELECT c.*, cp.encrypted_key, cp.iv, cp.is_favorite,
      (SELECT u.nickname FROM chat_participants cp2 JOIN users u ON cp2.user_id = u.id WHERE cp2.chat_id = c.id AND cp2.user_id != $1 LIMIT 1) as recipient_username
      FROM chats c
      JOIN chat_participants cp ON c.id = cp.chat_id
      WHERE c.id = $2 AND cp.user_id = $3
    `, userId, chatId, userId);
    
    res.json(newChat);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.issues[0].message });
    }
    console.error('Create chat error:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

router.get('/', async (req: any, res) => {
  const userId = req.user.id;
  
  try {
    const chats = await dbAll(`
      SELECT c.*, cp.encrypted_key, cp.iv, cp.is_favorite,
      (SELECT string_agg(user_id::text, ',') FROM chat_participants WHERE chat_id = c.id) as participant_ids,
      (SELECT encrypted_text FROM messages WHERE chat_id = c.id ORDER BY timestamp DESC LIMIT 1) as last_message,
      (SELECT timestamp FROM messages WHERE chat_id = c.id ORDER BY timestamp DESC LIMIT 1) as last_message_time,
      (SELECT u.nickname FROM chat_participants cp2 JOIN users u ON cp2.user_id = u.id WHERE cp2.chat_id = c.id AND cp2.user_id != $1 LIMIT 1) as recipient_username
      FROM chats c
      JOIN chat_participants cp ON c.id = cp.chat_id
      WHERE cp.user_id = $2
      ORDER BY cp.is_favorite DESC, last_message_time DESC NULLS LAST
    `, userId, userId);
    
    const formattedChats = chats.map((chat: any) => ({
      ...chat,
      participant_ids: chat.participant_ids ? chat.participant_ids.split(',').map(Number) : []
    }));
    
    res.json(formattedChats);
  } catch (error) {
    console.error('Fetch chats error:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

router.post('/:id/favorite', async (req: any, res) => {
  const chatId = req.params.id;
  const userId = req.user.id;
  
  try {
    const participant = await dbGet(
      'SELECT is_favorite FROM chat_participants WHERE chat_id = $1 AND user_id = $2',
      chatId, userId
    );
    
    if (!participant) return res.sendStatus(404);
    
    const newStatus = participant.is_favorite ? 0 : 1;
    await dbRun(
      'UPDATE chat_participants SET is_favorite = $1 WHERE chat_id = $2 AND user_id = $3',
      newStatus, chatId, userId
    );
    
    res.json({ is_favorite: newStatus });
  } catch (error) {
    console.error('Toggle favorite error:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

router.get('/saved-messages', async (req: any, res) => {
  const userId = req.user.id;
  try {
    const messages = await dbAll(`
      SELECT m.*, u.nickname as sender_nickname, c.name as chat_name, 1 as is_saved,
      (SELECT json_agg(json_build_object('id', a.id, 'original_name', a.original_name, 'mime_type', a.mime_type, 'encrypted_key', a.encrypted_key, 'iv', a.iv)) 
       FROM attachments a WHERE a.message_id = m.id) as attachments
      FROM saved_messages sm
      JOIN messages m ON sm.message_id = m.id
      JOIN users u ON m.sender_id = u.id
      JOIN chats c ON m.chat_id = c.id
      WHERE sm.user_id = $1
      ORDER BY sm.timestamp DESC
    `, userId);
    
    messages.forEach((m: any) => {
      if (typeof m.attachments === 'string') m.attachments = JSON.parse(m.attachments);
      if (!m.attachments) m.attachments = [];
    });
    
    res.json(messages);
  } catch (error) {
    console.error('Fetch saved messages error:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

router.get('/:id/messages', async (req: any, res) => {
  const chatId = req.params.id;
  const userId = req.user.id;
  
  try {
    const isParticipant = await dbGet(
      'SELECT 1 FROM chat_participants WHERE chat_id = $1 AND user_id = $2',
      chatId, userId
    );
    if (!isParticipant) return res.sendStatus(403);
    
    const messages = await dbAll(`
      SELECT m.*, u.nickname as sender_nickname, u.is_bot as sender_is_bot,
      (SELECT 1 FROM saved_messages WHERE message_id = m.id AND user_id = $1) as is_saved,
      (SELECT json_agg(json_build_object('id', a.id, 'original_name', a.original_name, 'mime_type', a.mime_type, 'encrypted_key', a.encrypted_key, 'iv', a.iv)) 
       FROM attachments a WHERE a.message_id = m.id) as attachments
      FROM messages m
      JOIN users u ON m.sender_id = u.id
      WHERE m.chat_id = $2
      ORDER BY m.timestamp ASC
    `, userId, chatId);
    
    messages.forEach((m: any) => {
      if (typeof m.attachments === 'string') m.attachments = JSON.parse(m.attachments);
      if (!m.attachments) m.attachments = [];
    });
    
    res.json(messages);
  } catch (error) {
    console.error('Fetch messages error:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

router.get('/:id/participants', async (req: any, res) => {
  const chatId = req.params.id;
  try {
    const participants = await dbAll(`
      SELECT u.id, u.nickname, u.email, u.public_key, cp.encrypted_key, cp.iv
      FROM chat_participants cp
      JOIN users u ON cp.user_id = u.id
      WHERE cp.chat_id = $1
    `, chatId);
    res.json(participants);
  } catch (error) {
    console.error('Fetch participants error:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

router.post('/messages/:id/save', async (req: any, res) => {
  const messageId = req.params.id;
  const userId = req.user.id;
  
  try {
    const saved = await dbGet(
      'SELECT 1 FROM saved_messages WHERE message_id = $1 AND user_id = $2',
      messageId, userId
    );
    
    if (saved) {
      await dbRun(
        'DELETE FROM saved_messages WHERE message_id = $1 AND user_id = $2',
        messageId, userId
      );
      res.json({ is_saved: 0 });
    } else {
      await dbRun(
        'INSERT INTO saved_messages (user_id, message_id) VALUES ($1, $2)',
        userId, messageId
      );
      res.json({ is_saved: 1 });
    }
  } catch (error) {
    console.error('Toggle save message error:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

router.delete('/:id', async (req: any, res) => {
  const chatId = req.params.id;
  const userId = req.user.id;
  
  try {
    const isParticipant = await dbGet(
      'SELECT 1 FROM chat_participants WHERE chat_id = $1 AND user_id = $2',
      chatId, userId
    );
    
    if (!isParticipant) return res.sendStatus(403);
    
    // Delete in correct order (foreign key constraints)
    await dbRun('DELETE FROM saved_messages WHERE message_id IN (SELECT id FROM messages WHERE chat_id = $1)', chatId);
    await dbRun('DELETE FROM attachments WHERE message_id IN (SELECT id FROM messages WHERE chat_id = $1)', chatId);
    await dbRun('DELETE FROM messages WHERE chat_id = $1', chatId);
    await dbRun('DELETE FROM chat_participants WHERE chat_id = $1', chatId);
    await dbRun('DELETE FROM chats WHERE id = $1', chatId);
    
    res.json({ success: true });
  } catch (error) {
    console.error('Delete chat error:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

export const chatRoutes = router;
