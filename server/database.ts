import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let db: Database;

export async function initDb() {
  db = await open({
    filename: path.join(__dirname, '../chat.db'),
    driver: sqlite3.Database
  });

  await db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      nickname TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      is_bot INTEGER DEFAULT 0,
      public_key TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS chats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL, -- 'private' or 'group'
      name TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS chat_participants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chat_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      encrypted_key TEXT NOT NULL, -- The chat key encrypted with user's master key
      iv TEXT NOT NULL,
      is_favorite INTEGER DEFAULT 0,
      FOREIGN KEY (chat_id) REFERENCES chats (id),
      FOREIGN KEY (user_id) REFERENCES users (id)
    );

    CREATE TABLE IF NOT EXISTS saved_messages (
      user_id INTEGER NOT NULL,
      message_id INTEGER NOT NULL,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (user_id, message_id),
      FOREIGN KEY (user_id) REFERENCES users (id),
      FOREIGN KEY (message_id) REFERENCES messages (id)
    );

    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chat_id INTEGER NOT NULL,
      sender_id INTEGER NOT NULL,
      encrypted_text TEXT NOT NULL,
      iv TEXT NOT NULL,
      ratchet_key TEXT,
      signature TEXT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (chat_id) REFERENCES chats (id),
      FOREIGN KEY (sender_id) REFERENCES users (id)
    );

    CREATE TABLE IF NOT EXISTS attachments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      message_id INTEGER NOT NULL,
      file_path TEXT NOT NULL,
      encrypted_key TEXT NOT NULL, -- The file key encrypted with chat key
      iv TEXT NOT NULL,
      original_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      FOREIGN KEY (message_id) REFERENCES messages (id)
    );

    -- Indexes for performance
    CREATE INDEX IF NOT EXISTS idx_chat_participants_user_id ON chat_participants(user_id);
    CREATE INDEX IF NOT EXISTS idx_messages_chat_id ON messages(chat_id);
    CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp);
  `);

  // Migrations for existing databases
  const migrations = [
    { table: 'users', column: 'is_bot', definition: 'INTEGER DEFAULT 0' },
    { table: 'users', column: 'public_key', definition: 'TEXT' },
    { table: 'chat_participants', column: 'is_favorite', definition: 'INTEGER DEFAULT 0' },
    { table: 'chat_participants', column: 'iv', definition: 'TEXT NOT NULL DEFAULT ""' },
    { table: 'attachments', column: 'iv', definition: 'TEXT NOT NULL DEFAULT ""' },
    { table: 'messages', column: 'iv', definition: 'TEXT NOT NULL DEFAULT ""' },
    { table: 'messages', column: 'ratchet_key', definition: 'TEXT' },
    { table: 'messages', column: 'signature', definition: 'TEXT' }
  ];

  for (const m of migrations) {
    try {
      await db.exec(`ALTER TABLE ${m.table} ADD COLUMN ${m.column} ${m.definition}`);
    } catch (e) {
      // Column might already exist, ignore error
    }
  }

  // Seed bots
  await db.run("INSERT OR IGNORE INTO users (email, nickname, password_hash, is_bot) VALUES ('q@bot.local', 'q', 'bot_password_hash', 1)");
  await db.run("INSERT OR IGNORE INTO users (email, nickname, password_hash, is_bot) VALUES ('w@bot.local', 'w', 'bot_password_hash', 1)");

  return db;
}

export function getDb() {
  if (!db) {
    throw new Error('Database not initialized. Call initDb() first.');
  }
  return db;
}

export default { getDb, initDb };
