# 💬 ChatSphere

> **A modern real-time chat application built with Next.js, Prisma, PostgreSQL, and WebSockets for seamless and secure communication.**

![Next.js](https://img.shields.io/badge/Next.js-15-black?style=for-the-badge&logo=next.js)
![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?style=for-the-badge&logo=typescript)
![Prisma](https://img.shields.io/badge/Prisma-ORM-2D3748?style=for-the-badge&logo=prisma)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Database-336791?style=for-the-badge&logo=postgresql)
![WebSocket](https://img.shields.io/badge/WebSocket-Real--Time-green?style=for-the-badge)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-Styling-38B2AC?style=for-the-badge&logo=tailwind-css)

---

# 📖 Overview

**ChatSphere** is a **full-stack real-time messaging platform** designed to provide fast, reliable, and interactive communication between users.

Built with **Next.js**, **TypeScript**, **Prisma ORM**, **PostgreSQL**, and **WebSockets**, the application supports instant messaging, persistent chat history, online presence detection, typing indicators, and scalable architecture.

The project demonstrates modern full-stack development practices and real-time event handling.

---

# ✨ Features

## 👤 User Features

- Secure User Authentication
- User Registration & Login
- Create One-to-One Conversations
- Real-Time Messaging
- View Previous Chat History
- Infinite Scroll for Messages
- Responsive User Interface
- Online / Offline Status
- Typing Indicators
- Read Receipts
- Auto Reconnection
- Persistent Conversations
- Fast Message Delivery

---

## 💬 Chat Features

- Instant Message Delivery
- Real-Time Socket Communication
- Message Persistence
- Duplicate Message Prevention
- Timestamp Support
- Ordered Conversations
- Chat History Loading
- Efficient Pagination
- Smooth UI Updates

---

## 🔐 Security Features

- JWT Authentication
- Protected API Routes
- Prisma Data Validation
- Server-side Authorization
- Input Validation
- Secure Session Handling

---

## ⚙️ Backend Features

- REST API Endpoints
- WebSocket Server
- Prisma ORM Integration
- PostgreSQL Database
- Optimized Queries
- Modular Code Structure
- Error Handling
- Scalable Architecture

---

# 🏗️ Tech Stack

| Technology | Purpose |
|------------|----------|
| Next.js | Full Stack Framework |
| TypeScript | Type Safety |
| React | Frontend UI |
| Tailwind CSS | Styling |
| Prisma ORM | Database ORM |
| PostgreSQL | Relational Database |
| WebSocket | Real-Time Communication |
| Node.js | Runtime Environment |

---

# 📂 Project Structure

```text
ChatSphere/
│
├── prisma/
│   ├── schema.prisma
│   └── migrations/
│
├── src/
│   ├── app/
│   │   ├── api/
│   │   ├── chat/
│   │   ├── login/
│   │   └── register/
│   │
│   ├── components/
│   │   ├── chat/
│   │   ├── ui/
│   │   └── layout/
│   │
│   ├── hooks/
│   │   ├── useChat.ts
│   │   └── useSocket.ts
│   │
│   ├── store/
│   │   └── chatStore.ts
│   │
│   ├── lib/
│   ├── services/
│   └── utils/
│
├── public/
├── package.json
├── tsconfig.json
├── .env
└── README.md
```

---

# 🚀 Installation

## 1️⃣ Clone the Repository

```bash
git clone https://github.com/your-username/ChatSphere.git

cd ChatSphere
```

---

## 2️⃣ Install Dependencies

```bash
npm install
```

or

```bash
pnpm install
```

---

## 3️⃣ Configure Environment Variables

Create a `.env` file in the project root.

```env
DATABASE_URL="postgresql://username:password@localhost:5432/chatsphere"

JWT_SECRET="your_jwt_secret"

NEXTAUTH_SECRET="your_secret"

NEXTAUTH_URL="http://localhost:3000"
```

---

## 4️⃣ Generate Prisma Client

```bash
npx prisma generate
```

---

## 5️⃣ Run Database Migrations

```bash
npx prisma migrate dev
```

---

## 6️⃣ Start Development Server

```bash
npm run dev
```

Open:

```
http://localhost:3000
```

---

# 🗄️ Database Design

## User

- id
- username
- email
- password
- createdAt

---

## Conversation

- id
- participants
- createdAt

---

## Message

- id
- senderId
- conversationId
- content
- timestamp
- isRead

---

# 🔄 Real-Time Communication Flow

```text
User A
   │
   │
   ▼
WebSocket Client
   │
   │
   ▼
WebSocket Server
   │
   │
   ▼
Store Message
(PostgreSQL)
   │
   │
   ▼
Broadcast Event
   │
   │
   ▼
User B
```

---

# 📸 Screenshots

You can add screenshots here.

```text
screenshots/

├── login.png
├── register.png
├── dashboard.png
├── chat-window.png
├── conversation-list.png
└── mobile-view.png
```

---

# 📈 Future Enhancements

- 📁 File Sharing
- 🎙️ Voice Messages
- 📹 Video Calling
- 📞 Audio Calling
- 😀 Emoji Reactions
- 📌 Pinned Messages
- 🗑️ Delete for Everyone
- ✏️ Edit Messages
- 🌙 Dark Mode
- 🔔 Push Notifications
- 👥 Group Chats
- 🔍 Message Search
- 📎 Media Gallery
- 🔐 End-to-End Encryption

---

# 🧪 Scripts

Start development server:

```bash
npm run dev
```

Build project:

```bash
npm run build
```

Start production server:

```bash
npm run start
```

Run Prisma Studio:

```bash
npx prisma studio
```

Generate Prisma Client:

```bash
npx prisma generate
```

Run Migrations:

```bash
npx prisma migrate dev
```

---

# 🤝 Contributing

Contributions are welcome.

1. Fork the repository.

2. Create a feature branch.

```bash
git checkout -b feature/new-feature
```

3. Commit your changes.

```bash
git commit -m "Added new feature"
```

4. Push the branch.

```bash
git push origin feature/new-feature
```

5. Open a Pull Request.

---

# 📄 License

Licensed under the **MIT License**.

---

# 👨‍💻 Author

## Kushal Vaghela

**Software Developer | Full Stack Developer | Next.js | MERN Stack | Django | Java**

---

# ⭐ Support

If you found this project useful:

- ⭐ Star this repository
- 🍴 Fork it
- 💡 Suggest improvements
- 🚀 Share it with the community

---

## 💭 Vision

> **ChatSphere is built to make conversations instant, reliable, and engaging by combining modern web technologies with scalable real-time architecture.**