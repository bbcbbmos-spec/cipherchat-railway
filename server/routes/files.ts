import { Router } from 'express';
import multer from 'multer';
import { v2 as cloudinary } from 'cloudinary';
import { dbGet, dbRun } from '../database.js';
import { authenticateToken } from './auth.js';

const router = Router();

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const ALLOWED_MIME = [
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf',
  'text/plain', 'video/mp4', 'audio/mpeg', 'audio/webm', 'video/webm', 'application/zip'
];

// Use memory storage instead of disk — we upload to Cloudinary
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024, files: 5 },
  fileFilter: (req, file, cb) => {
    cb(null, ALLOWED_MIME.includes(file.mimetype));
  }
});

// Helper: upload buffer to Cloudinary
async function uploadToCloudinary(fileBuffer: Buffer, originalName: string, mimeType: string): Promise<string> {
  const resourceType = mimeType.startsWith('video/') || mimeType.startsWith('audio/') ? 'video' : 
                        mimeType.startsWith('image/') ? 'image' : 'raw';
  
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: 'cipherchat',
        resource_type: resourceType,
        public_id: `${Date.now()}_${originalName.replace(/[^a-zA-Z0-9._-]/g, '_')}`,
      },
      (error, result) => {
        if (error) reject(error);
        else resolve(result!.secure_url);
      }
    );
    uploadStream.end(fileBuffer);
  });
}

router.use(authenticateToken);

router.post('/upload', upload.array('files'), async (req: any, res) => {
  const { chatId, encryptedText, iv, fileKeys } = req.body;
  const userId = req.user.id;
  const files = req.files as Express.Multer.File[];
  
  try {
    const messageResult = await dbRun(
      'INSERT INTO messages (chat_id, sender_id, encrypted_text, iv) VALUES ($1, $2, $3, $4) RETURNING id',
      chatId, userId, encryptedText, iv
    );
    const messageId = messageResult.rows[0].id;
    
    const uploadedFiles = [];
    const keys = JSON.parse(fileKeys);
    
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const keyData = keys[i];
      
      // Upload to Cloudinary
      const cloudinaryUrl = await uploadToCloudinary(file.buffer, file.originalname, file.mimetype);
      
      const result = await dbRun(
        'INSERT INTO attachments (message_id, file_path, encrypted_key, iv, original_name, mime_type) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
        messageId, cloudinaryUrl, keyData.wrappedKey, keyData.iv, file.originalname, file.mimetype
      );
      uploadedFiles.push({ id: result.rows[0].id, original_name: file.originalname, url: cloudinaryUrl });
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
    const attachment = await dbGet(`
      SELECT a.*, m.chat_id FROM attachments a
      JOIN messages m ON a.message_id = m.id
      JOIN chat_participants cp ON m.chat_id = cp.chat_id
      WHERE a.id = $1 AND cp.user_id = $2
    `, fileId, userId);
    
    if (!attachment) return res.sendStatus(403);
    
    // file_path now contains Cloudinary URL — redirect to it
    res.redirect(attachment.file_path);
  } catch (error) {
    console.error('Download error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export const fileRoutes = router;
