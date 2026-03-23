import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import dbModule from '../database.js';
import { authenticateToken } from './auth.js';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = Router();
const ALLOWED_MIME = [
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf',
  'text/plain', 'video/mp4', 'audio/mpeg', 'application/zip'
];

const upload = multer({
  dest: path.join(__dirname, '../../uploads/'),
  limits: { fileSize: 50 * 1024 * 1024, files: 5 },
  fileFilter: (req, file, cb) => {
    cb(null, ALLOWED_MIME.includes(file.mimetype));
  }
});

router.use(authenticateToken);

router.post('/upload', upload.array('files'), async (req: any, res) => {
  const { chatId, encryptedText, iv, fileKeys } = req.body;
  const userId = req.user.id;
  const files = req.files as any[];
  
  try {
    const db = dbModule.getDb();
    const messageResult = await db.run(
      'INSERT INTO messages (chat_id, sender_id, encrypted_text, iv) VALUES (?, ?, ?, ?)',
      chatId, userId, encryptedText, iv
    );
    const messageId = messageResult.lastID;
    
    const uploadedFiles = [];
    const keys = JSON.parse(fileKeys);
    
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const keyData = keys[i];
      const result = await db.run(
        'INSERT INTO attachments (message_id, file_path, encrypted_key, iv, original_name, mime_type) VALUES (?, ?, ?, ?, ?, ?)',
        messageId, file.path, keyData.wrappedKey, keyData.iv, file.originalname, file.mimetype
      );
      uploadedFiles.push({ id: result.lastID, original_name: file.originalname });
    }
    
    res.json({ messageId, files: uploadedFiles });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:id', async (req: any, res) => {
  const fileId = req.params.id;
  const userId = req.user.id;
  
  try {
    const db = dbModule.getDb();
    const attachment = await db.get(`
      SELECT a.*, m.chat_id FROM attachments a
      JOIN messages m ON a.message_id = m.id
      JOIN chat_participants cp ON m.chat_id = cp.chat_id
      WHERE a.id = ? AND cp.user_id = ?
    `, fileId, userId);
    
    if (!attachment) return res.sendStatus(403);
    
    // Path traversal protection
    const safePath = path.resolve(attachment.file_path);
    const uploadsDir = path.resolve(__dirname, '../../uploads');
    
    if (!safePath.startsWith(uploadsDir)) {
      console.error('Path traversal attempt detected:', safePath);
      return res.status(403).json({ error: 'Access denied' });
    }

    if (!fs.existsSync(safePath)) {
      return res.status(404).json({ error: 'File not found on server' });
    }
    
    const safeMime = ALLOWED_MIME.includes(attachment.mime_type) ? attachment.mime_type : 'application/octet-stream';
    res.setHeader('Content-Type', safeMime);
    
    const safeFilename = encodeURIComponent(attachment.original_name).replace(/'/g, '%27');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${safeFilename}`);
    
    fs.createReadStream(safePath).pipe(res);
  } catch (error) {
    console.error('Download error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export const fileRoutes = router;
