import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import fs from 'fs';
import cors from 'cors';
import helmet from 'helmet';

// Load environment variables

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  console.log('Starting server initialization...');
  const app = express();
  const httpServer = createServer(app);
  
  const isProduction = process.env.NODE_ENV === 'production';
  console.log(`Environment: ${isProduction ? 'production' : 'development'}`);
  const clientUrl = process.env.CLIENT_URL || '*';

  const io = new Server(httpServer, {
    cors: {
      origin: isProduction ? clientUrl : '*',
      methods: ["GET", "POST"]
    }
  });

  const PORT = parseInt(process.env.PORT || '3000', 10);
  
  app.use(helmet({
    contentSecurityPolicy: false,
    frameguard: false,
    crossOriginOpenerPolicy: false,
    crossOriginResourcePolicy: false
  }));

  app.use(cors());
  app.use(express.json());

  // Database initialization (PostgreSQL via Supabase)
  console.log('Initializing database...');
  const dbModule = await import('./server/database.js');
  await dbModule.default.initDb();
  console.log('Database initialized.');

  // API Routes
  console.log('Setting up API routes...');
  const { authRoutes } = await import('./server/routes/auth.js');
  const { chatRoutes } = await import('./server/routes/chats.js');
  const { userRoutes } = await import('./server/routes/users.js');
  const { fileRoutes } = await import('./server/routes/files.js');

  app.use('/api/auth', authRoutes);
  app.use('/api/chats', chatRoutes);
  app.use('/api/users', userRoutes);
  app.use('/api/files', fileRoutes);

  // Socket.io logic
  console.log('Setting up sockets...');
  const { setupSockets } = await import('./server/sockets.js');
  setupSockets(io);

  // Vite middleware for development or if dist is missing
  const distPath = path.join(__dirname, 'dist');
  if (!isProduction || !fs.existsSync(distPath)) {
    console.log('Setting up Vite middleware (fallback or development)...');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    console.log('Serving static files from dist...');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer().catch(console.error);
