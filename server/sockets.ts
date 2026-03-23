import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import dbModule from './database.js';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-key';
if (!process.env.JWT_SECRET) {
  console.warn('WARNING: JWT_SECRET env variable is missing. Using fallback for development.');
}

export function setupSockets(io: Server) {
  const userSockets = new Map<number, string>();

  // JWT Middleware for Socket.IO
  io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) {
      return next(new Error('Authentication error: Token missing'));
    }

    jwt.verify(token, JWT_SECRET, (err: any, decoded: any) => {
      if (err) {
        return next(new Error('Authentication error: Invalid token'));
      }
      socket.data.user = decoded;
      next();
    });
  });

  io.on('connection', async (socket: Socket) => {
    const userId = socket.data.user.id;
    const db = dbModule.getDb();

    userSockets.set(userId, socket.id);
    
    try {
      // Join all user's chats
      const chats = await db.all('SELECT chat_id FROM chat_participants WHERE user_id = ?', userId);
      chats.forEach(c => socket.join(`chat_${c.chat_id}`));
    } catch (error) {
      console.error('Socket connection error:', error);
    }

    socket.on('join_chat', async (chatId: number) => {
      try {
        console.log(`User ${userId} joining chat ${chatId}`);
        // Verify participation before joining
        const isParticipant = await db.get('SELECT 1 FROM chat_participants WHERE chat_id = ? AND user_id = ?', chatId, userId);
        if (isParticipant) {
          socket.join(`chat_${chatId}`);
          console.log(`User ${userId} joined room chat_${chatId}`);
        } else {
          console.warn(`User ${userId} tried to join unauthorized chat ${chatId}`);
        }
      } catch (error) {
        console.error('Socket join_chat error:', error);
      }
    });

    socket.on('send_message', async (data: { chatId: number, encryptedText: string, iv: string, ratchetKey?: string, signature?: string, attachments?: any[] }) => {
      const { chatId, encryptedText, iv, ratchetKey, signature, attachments } = data;
      
      if (iv === 'BOT') {
        const sender = await db.get('SELECT is_bot FROM users WHERE id = ?', userId);
        if (!sender?.is_bot) return socket.emit('error', { message: 'Invalid message format' });
      }

      console.log(`Received message for chat ${chatId} from user ${userId}`);
      
      try {
        // Verify participation before sending
        const isParticipant = await db.get('SELECT 1 FROM chat_participants WHERE chat_id = ? AND user_id = ?', chatId, userId);
        if (!isParticipant) {
          return socket.emit('error', { message: 'Not a participant of this chat' });
        }
 
        const result = await db.run(
          'INSERT INTO messages (chat_id, sender_id, encrypted_text, iv, ratchet_key, signature) VALUES (?, ?, ?, ?, ?, ?)', 
          chatId, userId, encryptedText, iv, ratchetKey || null, signature || null
        );
        const messageId = result.lastID;
        
        const sender = await db.get('SELECT nickname FROM users WHERE id = ?', userId);
        
        const message = {
          id: messageId,
          chat_id: chatId,
          sender_id: userId,
          sender_nickname: sender.nickname,
          encrypted_text: encryptedText,
          iv: iv,
          ratchet_key: ratchetKey,
          signature: signature,
          timestamp: new Date().toISOString(),
          attachments: attachments || []
        };
        
        io.to(`chat_${chatId}`).emit('new_message', message);
        console.log(`Broadcasting new_message to room chat_${chatId}`);

        // Bot Logic
        const participants = await db.all(`
          SELECT u.id, u.nickname, u.is_bot 
          FROM chat_participants cp
          JOIN users u ON cp.user_id = u.id
          WHERE cp.chat_id = ? AND u.is_bot = 1
        `, chatId);

        for (const bot of participants) {
          if (bot.id === userId) continue; // Don't respond to self if bot is sender (though bots don't send via socket)

          setTimeout(async () => {
            const botResponses: Record<string, string[]> = {
              'q': [
                "Hello! I'm bot Q. How can I help you today?",
                "That's interesting! Tell me more.",
                "I'm just a bot, but I'm here to test the interface with you!",
                "Everything looks good on my end! 🚀"
              ],
              'w': [
                "Greetings! Bot W at your service.",
                "I'm processing your message... Beep boop.",
                "The encryption seems to be working perfectly!",
                "Testing, testing, 1-2-3. W is here!"
              ]
            };

            const responses = botResponses[bot.nickname] || ["I'm a bot!"];
            const responseText = responses[Math.floor(Math.random() * responses.length)];
            
            // Bot sends "plain text" in encrypted_text field with iv='BOT'
            const botResult = await db.run(
              'INSERT INTO messages (chat_id, sender_id, encrypted_text, iv) VALUES (?, ?, ?, ?)',
              chatId, bot.id, responseText, 'BOT'
            );
            
            const botMessage = {
              id: botResult.lastID,
              chat_id: chatId,
              sender_id: bot.id,
              sender_nickname: bot.nickname,
              sender_is_bot: 1,
              encrypted_text: responseText,
              iv: 'BOT',
              timestamp: new Date().toISOString(),
              attachments: []
            };
            
            io.to(`chat_${chatId}`).emit('new_message', botMessage);
          }, 1000 + Math.random() * 2000);
        }
      } catch (error) {
        console.error('Socket send_message error:', error);
        socket.emit('error', { message: 'Internal server error' });
      }
    });

    socket.on('disconnect', () => {
      userSockets.delete(userId);
    });
  });
}
