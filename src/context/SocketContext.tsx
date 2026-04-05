"use client";

import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { io, Socket } from "socket.io-client";
import { useAuth } from "./AuthContext";

export type MessageType = 'deadline' | 'decision' | 'task' | 'alert' | 'payment' | 'normal';
export type EmotionType = 'happy' | 'sad' | 'angry' | 'frustrated' | 'neutral' | 'excited';
export type SentimentType = 'positive' | 'negative' | 'neutral';

export interface MessageData {
  id: string;
  from: string;
  to: string;
  message: string;
  timestamp: string;
  status: 'sent' | 'delivered' | 'failed' | 'read';
  // AI Smart Highlight fields
  isImportant?: boolean;
  msgType?: MessageType;
  confidence?: number;
  // AI Emotion Detection fields
  emotion?: EmotionType;
  sentiment?: SentimentType;
  emotionConfidence?: number;
  // Real-time Translation fields
  translated?: string;
  language?: string;
  isDeleted?: boolean;
  isEdited?: boolean;
  isAI?: boolean;
}


interface SocketContextType {
  socket: Socket | null;
  messages: MessageData[];
  sendMessage: (to: string, message: string) => void;
  onlineStatuses: { [username: string]: boolean };
  typingUsers: { [username: string]: boolean };
  sendTyping: (to: string, isTyping: boolean) => void;
  checkUser: (username: string) => Promise<boolean>;
  markAsRead: (fromUser: string) => void;
  userLanguage: string;
  updateLanguage: (lang: string) => void;
  deleteMessage: (id: string, from: string) => void;
  editMessage: (id: string, from: string, newContent: string) => void;
  deleteChat: (username: string, chatPartner: string) => void;
}


const SocketContext = createContext<SocketContextType | undefined>(undefined);

export const SocketProvider = ({ children }: { children: React.ReactNode }) => {
  const { user } = useAuth();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [messages, setMessages] = useState<MessageData[]>([]);
  const [onlineStatuses, setOnlineStatuses] = useState<{ [username: string]: boolean }>({});
  const [typingUsers, setTypingUsers] = useState<{ [username: string]: boolean }>({});
  const [userLanguage, setUserLanguage] = useState<string>("en");


  useEffect(() => {
    if (!user) return;

    // Connect to WebSocket Server (Production URL from env, or local fallback)
    const socketUrl = process.env.NEXT_PUBLIC_WS_SERVER_URL || "http://localhost:3001";
    const newSocket = io(socketUrl);
    setSocket(newSocket);

    newSocket.on("connect", () => {
      newSocket.emit("register", { username: user.username, phone: user.phoneNumber });
    });

    // Receive PostgreSQL historical chat history
    newSocket.on("chat_history", (history: MessageData[]) => {
      setMessages(history);
    });

    // Incoming new messages
    newSocket.on("receive_message", (data: MessageData & { tempId?: string }) => {
      setMessages((prev) => {
        // If we already have this message (by database ID), ignore it
        if (prev.some(m => m.id === data.id)) return prev;

        // If this is our own message coming back (matching our optimistic tempId), 
        // replace the optimistic entry with the real database entry.
        if (data.tempId && prev.some(m => m.id === data.tempId)) {
          return prev.map(m => m.id === data.tempId ? { ...data, id: data.id } : m);
        }

        // Otherwise, add it as a new message
        return [...prev, data];
      });
    });

    // Our message delivered correctly
    newSocket.on("message_status", ({ id, status }: { id: string, status: any }) => {
      setMessages((prev) => 
        prev.map(msg => msg.id === id ? { ...msg, status } : msg)
      );
    });

    // WhatsApp Blue Ticks functionality
    newSocket.on("messages_read", (readIds: string[]) => {
      setMessages((prev) => 
        prev.map(msg => readIds.includes(msg.id) ? { ...msg, status: 'read' } : msg)
      );
    });

    // Realtime typing indicators
    newSocket.on("typing_status", ({ from, isTyping }: { from: string, isTyping: boolean }) => {
      setTypingUsers(prev => ({ ...prev, [from]: isTyping }));
    });

    // Global online tracking
    newSocket.on("user_online_status", ({ username, isOnline }: { username: string, isOnline: boolean }) => {
      setOnlineStatuses(prev => ({ ...prev, [username]: isOnline }));
    });

    // AI Smart Highlight: server emits this after async Gemini classification
    newSocket.on("message_classified", (data: { id: string; isImportant: boolean; msgType: MessageType; confidence: number }) => {
      setMessages(prev =>
        prev.map(msg =>
          String(msg.id) === String(data.id)
            ? { ...msg, isImportant: data.isImportant, msgType: data.msgType, confidence: data.confidence }
            : msg
        )
      );
    });

    // AI Emotion Detection: server emits this after async Gemini emotion analysis
    newSocket.on("message_emotion", (data: { id: string; emotion: EmotionType; sentiment: SentimentType; emotionConfidence: number }) => {
      setMessages(prev =>
        prev.map(msg =>
          String(msg.id) === String(data.id)
            ? { ...msg, emotion: data.emotion, sentiment: data.sentiment, emotionConfidence: data.emotionConfidence }
            : msg
        )
      );
    });

    // Real-time Translation Update
    newSocket.on("message_translated", (data: { id: string; translated: string; language: string }) => {
      setMessages(prev =>
        prev.map(msg =>
          String(msg.id) === String(data.id)
            ? { ...msg, translated: data.translated, language: data.language }
            : msg
        )
      );
    });

    // User Language Preference from server
    newSocket.on("user_language", (lang: string) => {
      setUserLanguage(lang);
    });

    // REAL-TIME SYNC: Message Edited/Deleted/Chat Deleted
    newSocket.on("message_deleted", ({ messageId }: { messageId: string }) => {
      setMessages(prev => 
        prev.map(m => String(m.id) === String(messageId) ? { ...m, message: 'This message was deleted', isDeleted: true } : m)
      );
    });

    newSocket.on("message_updated", ({ messageId, newContent, isEdited }: { messageId: string, newContent: string, isEdited: boolean }) => {
      setMessages(prev => 
        prev.map(m => String(m.id) === String(messageId) ? { ...m, message: newContent, isEdited } : m)
      );
    });

    newSocket.on("chat_deleted", ({ chatPartner }: { chatPartner: string }) => {
      setMessages(prev => 
        prev.filter(m => (m.from !== chatPartner || m.to !== user?.username) && (m.to !== chatPartner || m.from !== user?.username))
      );
    });


    return () => {
      newSocket.disconnect();
    };
  }, [user]);

  const sendMessage = useCallback((to: string, message: string) => {
    if (!socket || !user) return;

    const syntheticId = Math.random().toString(36).substring(2, 11);
    const ts = new Date().toISOString();
    
    const data = {
      id: syntheticId,
      from: user.username,
      to,
      message,
      timestamp: ts
    };
    
    const tempMessage: MessageData = { ...data, status: 'sent' };
    setMessages((prev) => [...prev, tempMessage]);
    
    socket.emit("send_message", data);
  }, [socket, user]);

  const sendTyping = useCallback((to: string, isTyping: boolean) => {
    if (!socket || !user) return;
    socket.emit("typing", { to, isTyping });
  }, [socket, user]);

  const checkUser = useCallback((targetUsername: string): Promise<boolean> => {
    return new Promise((resolve) => {
      if (!socket) return resolve(false);

      const handleResult = (data: { username: string, exists: boolean }) => {
        if (data.username === targetUsername) {
          socket.off("check_user_result", handleResult);
          resolve(data.exists);
        }
      };

      socket.on("check_user_result", handleResult);
      socket.emit("check_user", targetUsername);
      
      setTimeout(() => {
        socket.off("check_user_result", handleResult);
        resolve(false);
      }, 5000);
    });
  }, [socket]);

  const markAsRead = useCallback((fromUser: string) => {
    if (!socket || !user) return;
    // Tell server we read all unread messages from 'fromUser' to us ('toUser')
    socket.emit("mark_read", { fromUser, toUser: user.username });
    
    // Optimistically fix it locally so logic is instant instead of roundtrip
    setMessages(prev => 
      prev.map(m => (m.from === fromUser && m.to === user.username && m.status !== 'read') ? { ...m, status: 'read' } : m)
    );
  }, [socket, user]);

  const updateLanguage = useCallback((lang: string) => {
    if (!socket) return;
    socket.emit("update_language", lang);
    setUserLanguage(lang);
  }, [socket]);

  const deleteMessage = useCallback((id: string, from: string) => {
    if (!socket) return;
    socket.emit("delete_message", { id, from });
  }, [socket]);

  const editMessage = useCallback((id: string, from: string, newContent: string) => {
    if (!socket) return;
    socket.emit("edit_message", { id, from, newContent });
  }, [socket]);

  const deleteChat = useCallback((username: string, chatPartner: string) => {
    if (!socket) return;
    socket.emit("delete_chat", { username, chatPartner });
  }, [socket]);

  return (
    <SocketContext.Provider value={{ 
      socket, messages, sendMessage, onlineStatuses, typingUsers, 
      sendTyping, checkUser, markAsRead, userLanguage, updateLanguage,
      deleteMessage, editMessage, deleteChat
    }}>
      {children}
    </SocketContext.Provider>
  );
};

export const useSocket = () => {
  const context = useContext(SocketContext);
  if (!context) {
    throw new Error("useSocket must be used within a SocketProvider");
  }
  return context;
};
