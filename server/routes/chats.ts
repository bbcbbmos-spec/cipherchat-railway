import { Router } from 'express';
import { z } from 'zod';
import dbModule from '../database.js';
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
    const db = dbModule.getDb();
    
    const allParticipants = Array.from(new Set([...participantIds, userId]));
    
    // For private chats, check if one already exists
    if (type === 'private' && allParticipants.length === 2) {
      const otherUserId = allParticipants.find(id => id !== userId);
      const existingChat = await db.get(`
        SELECT c.id, cp.encrypted_key, cp.iv, cp.is_favorite,
        (SELECT u.nickname FROM chat_participants cp2 JOIN users u ON cp2.user_id = u.id WHERE cp2.chat_id = c.id AND cp2.user_id != ? LIMIT 1) as recipient_username
        FROM chats c
        JOIN chat_participants cp ON c.id = cp.chat_id
        WHERE c.type = 'private' 
        AND cp.user_id = ?
        AND EXISTS (SELECT 1 FROM chat_participants cp3 WHERE cp3.chat_id = c.id AND cp3.user_id = ?)
      `, userId, userId, otherUserId);

      if (existingChat) {
        return res.json(existingChat);
      }
    }

    // Check if all participants exist
    const existingUsers = await db.all(
      `SELECT id FROM users WHERE id IN (${allParticipants.map(() => '?').join(',')})`,
      ...allParticipants
    );
    
    if (existingUsers.length !== allParticipants.length) {
      return res.status(400).json({ error: 'Один или несколько участников не существуют' });
    }

    // Check if all participants have encrypted keys (if provided)
    if (encryptedKeys) {
      for (const pid of allParticipants) {
        const pidStr = pid.toString();
        if (!encryptedKeys[pidStr]) {
          return res.status(400).json({ error: `Отсутствует зашифрованный ключ для участника ${pid}` });
        }
      }
    }

    const chatResult = await db.run(
      'INSERT INTO chats (type, name) VALUES (?, ?)',
      type, name || null
    );
    const chatId = chatResult.lastID;
    
    for (const pId of allParticipants) {
      const keyData = encryptedKeys ? encryptedKeys[pId.toString()] : null;
      await db.run(
        'INSERT INTO chat_participants (chat_id, user_id, encrypted_key, iv) VALUES (?, ?, ?, ?)',
        chatId, pId, keyData?.wrappedKey || '', keyData?.iv || ''
      );
    }
    
    // Return the full chat object for the creator
    const newChat = await db.get(`
      SELECT c.*, cp.encrypted_key, cp.iv, cp.is_favorite,
      (SELECT u.nickname FROM chat_participants cp2 JOIN users u ON cp2.user_id = u.id WHERE cp2.chat_id = c.id AND cp2.user_id != ? LIMIT 1) as recipient_username
      FROM chats c
      JOIN chat_participants cp ON c.id = cp.chat_id
      WHERE c.id = ? AND cp.user_id = ?
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
    const db = dbModule.getDb();
    const chats = await db.all(`
      SELECT c.*, cp.encrypted_key, cp.iv, cp.is_favorite,
      (SELECT GROUP_CONCAT(user_id) FROM chat_participants WHERE chat_id = c.id) as participant_ids,
      (SELECT encrypted_text FROM messages WHERE chat_id = c.id ORDER BY timestamp DESC LIMIT 1) as last_message,
      (SELECT timestamp FROM messages WHERE chat_id = c.id ORDER BY timestamp DESC LIMIT 1) as last_message_time,
      (SELECT u.nickname FROM chat_participants cp2 JOIN users u ON cp2.user_id = u.id WHERE cp2.chat_id = c.id AND cp2.user_id != ? LIMIT 1) as recipient_username
      FROM chats c
      JOIN chat_participants cp ON c.id = cp.chat_id
      WHERE cp.user_id = ?
      ORDER BY cp.is_favorite DESC, last_message_time DESC
    `, userId, userId);
    
    const formattedChats = chats.map(chat => ({
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
    const db = dbModule.getDb();
    const participant = await db.get(
      'SELECT is_favorite FROM chat_participants WHERE chat_id = ? AND user_id = ?',
      chatId, userId
    );
    
    if (!participant) return res.sendStatus(404);
    
    const newStatus = participant.is_favorite ? 0 : 1;
    await db.run(
      'UPDATE chat_participants SET is_favorite = ? WHERE chat_id = ? AND user_id = ?',
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
    const db = dbModule.getDb();
    const messages = await db.all(`
      SELECT m.*, u.nickname as sender_nickname, c.name as chat_name, 1 as is_saved,
      (SELECT json_group_array(json_object('id', a.id, 'original_name', a.original_name, 'mime_type', a.mime_type, 'encrypted_key', a.encrypted_key, 'iv', a.iv)) 
       FROM attachments a WHERE a.message_id = m.id) as attachments
      FROM saved_messages sm
      JOIN messages m ON sm.message_id = m.id
      JOIN users u ON m.sender_id = u.id
      JOIN chats c ON m.chat_id = c.id
      WHERE sm.user_id = ?
      ORDER BY sm.timestamp DESC
    `, userId);
    
    messages.forEach(m => {
      m.attachments = JSON.parse(m.attachments);
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
    const db = dbModule.getDb();
    // Check if user is participant
    const isParticipant = await db.get(
      'SELECT 1 FROM chat_participants WHERE chat_id = ? AND user_id = ?',
      chatId, userId
    );
    if (!isParticipant) return res.sendStatus(403);
    
    const messages = await db.all(`
      SELECT m.*, u.nickname as sender_nickname, u.is_bot as sender_is_bot,
      (SELECT 1 FROM saved_messages WHERE message_id = m.id AND user_id = ?) as is_saved,
      (SELECT json_group_array(json_object('id', a.id, 'original_name', a.original_name, 'mime_type', a.mime_type, 'encrypted_key', a.encrypted_key, 'iv', a.iv)) 
       FROM attachments a WHERE a.message_id = m.id) as attachments
      FROM messages m
      JOIN users u ON m.sender_id = u.id
      WHERE m.chat_id = ?
      ORDER BY m.timestamp ASC
    `, userId, chatId);
    
    messages.forEach(m => {
      m.attachments = JSON.parse(m.attachments);
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
    const db = dbModule.getDb();
    const participants = await db.all(`
      SELECT u.id, u.nickname, u.email, u.public_key, cp.encrypted_key, cp.iv
      FROM chat_participants cp
      JOIN users u ON cp.user_id = u.id
      WHERE cp.chat_id = ?
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
    const db = dbModule.getDb();
    const saved = await db.get(
      'SELECT 1 FROM saved_messages WHERE message_id = ? AND user_id = ?',
      messageId, userId
    );
    
    if (saved) {
      await db.run(
        'DELETE FROM saved_messages WHERE message_id = ? AND user_id = ?',
        messageId, userId
      );
      res.json({ is_saved: 0 });
    } else {
      await db.run(
        'INSERT INTO saved_messages (user_id, message_id) VALUES (?, ?)',
        userId, messageId
      );
      res.json({ is_saved: 1 });
    }
  } catch (error) {
    console.error('Toggle save message error:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

export const chatRoutes = router;

router.delete('/:id', async (req: any, res) => {
  const chatId = req.params.id;
  const userId = req.user.id;
  
  try {
    const db = dbModule.getDb();
    
    // Check if user is participant
    const isParticipant = await db.get(
      'SELECT 1 FROM chat_participants WHERE chat_id = ? AND user_id = ?',
      chatId, userId
    );
    
    if (!isParticipant) return res.sendStatus(403);
    
    // Delete chat (cascading deletes should handle messages and participants if set up, 
    // but we'll do it manually to be safe or if foreign keys are not cascading)
    await db.run('DELETE FROM messages WHERE chat_id = ?', chatId);
    await db.run('DELETE FROM chat_participants WHERE chat_id = ?', chatId);
    await db.run('DELETE FROM chats WHERE id = ?', chatId);
    
    res.json({ success: true });
  } catch (error) {
    console.error('Delete chat error:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});
