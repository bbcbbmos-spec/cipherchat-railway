import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { dbAll, dbGet, dbRun } from './database.js';

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

    userSockets.set(userId, socket.id);
    
    try {
      const chats = await dbAll('SELECT chat_id FROM chat_participants WHERE user_id = $1', userId);
      chats.forEach((c: any) => socket.join(`chat_${c.chat_id}`));
    } catch (error) {
      console.error('Socket connection error:', error);
    }

    socket.on('join_chat', async (chatId: number) => {
      try {
        console.log(`User ${userId} joining chat ${chatId}`);
        const isParticipant = await dbGet('SELECT 1 FROM chat_participants WHERE chat_id = $1 AND user_id = $2', chatId, userId);
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
        const sender = await dbGet('SELECT is_bot FROM users WHERE id = $1', userId);
        if (!sender?.is_bot) return socket.emit('error', { message: 'Invalid message format' });
      }

      console.log(`Received message for chat ${chatId} from user ${userId}`);
      
      try {
        const isParticipant = await dbGet('SELECT 1 FROM chat_participants WHERE chat_id = $1 AND user_id = $2', chatId, userId);
        if (!isParticipant) {
          return socket.emit('error', { message: 'Not a participant of this chat' });
        }
 
        const result = await dbRun(
          'INSERT INTO messages (chat_id, sender_id, encrypted_text, iv, ratchet_key, signature) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id', 
          chatId, userId, encryptedText, iv, ratchetKey || null, signature || null
        );
        const messageId = result.rows[0].id;
        
        const sender = await dbGet('SELECT nickname FROM users WHERE id = $1', userId);
        
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
        const participants = await dbAll(`
          SELECT u.id, u.nickname, u.is_bot 
          FROM chat_participants cp
          JOIN users u ON cp.user_id = u.id
          WHERE cp.chat_id = $1 AND u.is_bot = 1
        `, chatId);

        for (const bot of participants) {
          if (bot.id === userId) continue;

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
            
            const botResult = await dbRun(
              'INSERT INTO messages (chat_id, sender_id, encrypted_text, iv) VALUES ($1, $2, $3, $4) RETURNING id',
              chatId, bot.id, responseText, 'BOT'
            );
            
            const botMessage = {
              id: botResult.rows[0].id,
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
