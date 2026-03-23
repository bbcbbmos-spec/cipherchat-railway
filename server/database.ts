import pg from 'pg';


const { Pool } = pg;

let pool: pg.Pool;

export async function initDb() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL environment variable is not set!');
  }
  console.log('Connecting to database:', databaseUrl.replace(/:[^:@]+@/, ':****@'));
  
  pool = new Pool({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false },
  });

  // Test connection
  const client = await pool.connect();
  console.log('Connected to PostgreSQL (Supabase)');

  await client.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      nickname TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      is_bot INTEGER DEFAULT 0,
      public_key TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS chats (
      id SERIAL PRIMARY KEY,
      type TEXT NOT NULL,
      name TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS chat_participants (
      id SERIAL PRIMARY KEY,
      chat_id INTEGER NOT NULL REFERENCES chats(id),
      user_id INTEGER NOT NULL REFERENCES users(id),
      encrypted_key TEXT NOT NULL DEFAULT '',
      iv TEXT NOT NULL DEFAULT '',
      is_favorite INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS messages (
      id SERIAL PRIMARY KEY,
      chat_id INTEGER NOT NULL REFERENCES chats(id),
      sender_id INTEGER NOT NULL REFERENCES users(id),
      encrypted_text TEXT NOT NULL,
      iv TEXT NOT NULL DEFAULT '',
      ratchet_key TEXT,
      signature TEXT,
      timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS saved_messages (
      user_id INTEGER NOT NULL REFERENCES users(id),
      message_id INTEGER NOT NULL REFERENCES messages(id),
      timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (user_id, message_id)
    );

    CREATE TABLE IF NOT EXISTS attachments (
      id SERIAL PRIMARY KEY,
      message_id INTEGER NOT NULL REFERENCES messages(id),
      file_path TEXT NOT NULL,
      encrypted_key TEXT NOT NULL DEFAULT '',
      iv TEXT NOT NULL DEFAULT '',
      original_name TEXT NOT NULL,
      mime_type TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_chat_participants_user_id ON chat_participants(user_id);
    CREATE INDEX IF NOT EXISTS idx_messages_chat_id ON messages(chat_id);
    CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp);
  `);

  // Seed bots
  await client.query(
    `INSERT INTO users (email, nickname, password_hash, is_bot) VALUES ('q@bot.local', 'q', 'bot_password_hash', 1) ON CONFLICT (email) DO NOTHING`
  );
  await client.query(
    `INSERT INTO users (email, nickname, password_hash, is_bot) VALUES ('w@bot.local', 'w', 'bot_password_hash', 1) ON CONFLICT (email) DO NOTHING`
  );

  client.release();
  console.log('Database schema initialized.');
  return pool;
}

export function getDb() {
  if (!pool) {
    throw new Error('Database not initialized. Call initDb() first.');
  }
  return pool;
}

// Helper: выполнить запрос и вернуть все строки
export async function dbAll(query: string, ...params: any[]) {
  const result = await pool.query(query, params);
  return result.rows;
}

// Helper: выполнить запрос и вернуть первую строку
export async function dbGet(query: string, ...params: any[]) {
  const result = await pool.query(query, params);
  return result.rows[0] || null;
}

// Helper: выполнить INSERT/UPDATE/DELETE и вернуть результат
export async function dbRun(query: string, ...params: any[]) {
  const result = await pool.query(query, params);
  return result;
}

export default { getDb, initDb, dbAll, dbGet, dbRun };