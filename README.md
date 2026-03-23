# CipherChat PWA

A secure, full-stack chat application with end-to-end encryption (E2EE) and PWA support.

## Features
- **End-to-End Encryption**: All messages and files are encrypted on the client using AES-256-GCM.
- **PWA Support**: Installable on mobile and desktop, works offline.
- **Real-time Messaging**: Powered by Socket.io.
- **Secure Auth**: JWT-based authentication with password-derived master keys.
- **File Sharing**: Encrypted file uploads and downloads.

## Setup
1. The app uses SQLite for the database.
2. Environment variables:
   - `JWT_SECRET`: Secret for signing JWT tokens.
3. Run `npm run dev` to start the server and frontend.

## Security Architecture
- **Master Key**: Derived from user's password using PBKDF2 (100k iterations).
- **Chat Key**: Random AES-256 key generated for each chat, wrapped with participants' master keys.
- **Message Encryption**: Each message is encrypted with the chat key.
- **File Encryption**: Each file is encrypted with a unique key, which is then encrypted with the chat key.
