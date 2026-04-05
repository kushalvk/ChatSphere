"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { useAuth } from "@/context/AuthContext";
import { useSocket, MessageData } from "@/context/SocketContext";
import { useRouter } from "next/navigation";
import {
  LogOut, Send, MessageSquare, Check, CheckCheck, UserCircle2,
  UserPlus, Loader2, RefreshCw, Zap, Search, X, Sparkles,
  Filter, Brain, Trash2, Edit3, Menu, Globe, Languages, HelpCircle,
} from "lucide-react";
import { MessageType, EmotionType } from "@/context/SocketContext";

export default function ChatDashboard() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const {
    messages, sendMessage, checkUser, sendTyping, typingUsers,
    markAsRead, onlineStatuses, userLanguage, updateLanguage,
    deleteMessage, editMessage, deleteChat,
  } = useSocket();

  const [activeChat, setActiveChat] = useState<string | null>(null);
  const [showOriginal, setShowOriginal] = useState<Record<string, boolean>>({});
  const [inputText, setInputText] = useState("");
  const [newChatUser, setNewChatUser] = useState("");
  const [isChecking, setIsChecking] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const [smartReplies, setSmartReplies] = useState<string[]>([]);
  const [isGeneratingReplies, setIsGeneratingReplies] = useState(false);

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showSearch, setShowSearch] = useState(false);

  const [showSummaryModal, setShowSummaryModal] = useState(false);
  const [summary, setSummary] = useState("");
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [summaryMeta, setSummaryMeta] = useState<{
    cached: boolean; messageCount: number; updatedAt: string;
  } | null>(null);
  const [summaryError, setSummaryError] = useState("");

  const [importantOnly, setImportantOnly] = useState(false);

  const [showMemoryModal, setShowMemoryModal] = useState(false);
  const [memories, setMemories] = useState<{
    id: string; content: string; category: string; createdAt: string;
  }[]>([]);
  const [isLoadingMemories, setIsLoadingMemories] = useState(false);
  const [personalizedReplies, setPersonalizedReplies] = useState<string[]>([]);
  const [isPersonalizing, setIsPersonalizing] = useState(false);
  const [memoryTab, setMemoryTab] = useState<"replies" | "memories">("replies");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");

  const [isAskAIOpen, setIsAskAIOpen] = useState(false);
  const [aiQuery, setAiQuery] = useState("");
  const [aiResponse, setAiResponse] = useState("");
  const [isAskingAI, setIsAskingAI] = useState(false);

  const [isAIPanelOpen, setIsAIPanelOpen] = useState(false);
  const [panelInput, setPanelInput] = useState("");
  const [panelMessages, setPanelMessages] = useState<
    { role: "user" | "ai"; content: string }[]
  >([]);
  const [isPanelLoading, setIsPanelLoading] = useState(false);

  const [prediction, setPrediction] = useState("");
  const predictionCache = useRef<Record<string, string>>({});
  const predictionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Lifecycle ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!user) router.push("/login");
  }, [user, router]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, activeChat, typingUsers, importantOnly]);

  useEffect(() => {
    return () => {
      if (predictionTimeoutRef.current) clearTimeout(predictionTimeoutRef.current);
      if (abortControllerRef.current) abortControllerRef.current.abort();
    };
  }, []);

  useEffect(() => {
    if (activeChat && user) {
      const t = setTimeout(() => markAsRead(activeChat), 100);
      return () => clearTimeout(t);
    }
  }, [activeChat, messages.length, markAsRead, user]);

  useEffect(() => {
    if (typeof window !== "undefined" && window.innerWidth < 640 && activeChat) {
      setIsSidebarOpen(false);
    }
  }, [activeChat]);

  // ── Derived Data ───────────────────────────────────────────────────────────
  const activeMessages = useMemo(() => {
    if (!user) return [];
    return messages.filter(
      (m) =>
        (m.from === user.username && m.to === activeChat) ||
        (m.to === user.username && m.from === activeChat)
    );
  }, [messages, user, activeChat]);

  const contactsDetails = useMemo(() => {
    if (!user) return [];
    const map = new Map<string, { lastMessage: MessageData | null; unreadCount: number }>();
    const sorted = [...messages].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
    sorted.forEach((msg) => {
      const isMe = msg.from === user.username;
      const partner = isMe ? msg.to : msg.from;
      const prev = map.get(partner) || { lastMessage: null, unreadCount: 0 };
      const unreadAdd = !isMe && msg.status !== "read" ? 1 : 0;
      map.set(partner, { lastMessage: msg, unreadCount: prev.unreadCount + unreadAdd });
    });
    if (activeChat && !map.has(activeChat))
      map.set(activeChat, { lastMessage: null, unreadCount: 0 });
    return Array.from(map.entries())
      .map(([username, data]) => ({ username, ...data }))
      .sort((a, b) => {
        const aT = a.lastMessage ? new Date(a.lastMessage.timestamp).getTime() : 0;
        const bT = b.lastMessage ? new Date(b.lastMessage.timestamp).getTime() : 0;
        return bT - aT;
      });
  }, [messages, user, activeChat]);

  // ── Smart Replies ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!user || !activeChat) return;
    if (activeMessages.length > 0) {
      const lastMsg = activeMessages[activeMessages.length - 1];
      if (lastMsg.from !== user.username) {
        setIsGeneratingReplies(true);
        const timer = setTimeout(() => fetchSmartReplies(activeMessages), 1500);
        return () => clearTimeout(timer);
      } else {
        setSmartReplies([]);
        setIsGeneratingReplies(false);
      }
    } else {
      setSmartReplies([]);
    }
  }, [activeMessages.length, activeChat, user]);

  const fetchSmartReplies = async (contextMsgs: MessageData[]) => {
    if (!user) return;
    setIsGeneratingReplies(true);
    setSmartReplies([]);
    try {
      const payload = contextMsgs.slice(-10).map((m) => ({
        role: m.from === user.username ? "user" : "assistant",
        content: m.message,
      }));
      const res = await fetch("/api/ai/smart-reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: payload }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.replies) setSmartReplies(Array.from(new Set<string>(data.replies)));
      }
    } catch {
      setSmartReplies(["Quota limit. Try later."]);
    } finally {
      setIsGeneratingReplies(false);
    }
  };

  // ── Summary ────────────────────────────────────────────────────────────────
  const fetchSummary = async (forceRefresh = false) => {
    if (!user || !activeChat) return;
    setIsSummarizing(true);
    setSummaryError("");
    setSummary("");
    setSummaryMeta(null);
    setShowSummaryModal(true);
    try {
      const chatId = [user.username, activeChat].sort().join("__");
      const res = await fetch("/api/ai/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatId, limit: 50, forceRefresh }),
      });
      const data = await res.json();
      if (res.ok && data.summary) {
        setSummary(data.summary);
        setSummaryMeta({
          cached: data.cached,
          messageCount: data.messageCount,
          updatedAt: data.updatedAt,
        });
      } else {
        setSummaryError(data.error || "Failed to generate summary.");
      }
    } catch {
      setSummaryError("Network error. AI unreachable.");
    } finally {
      setIsSummarizing(false);
    }
  };

  // ── Ask AI ─────────────────────────────────────────────────────────────────
  const handleAskAI = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!aiQuery.trim() || !activeChat || !user) return;
    setIsAskingAI(true);
    setAiResponse("");
    try {
      const res = await fetch("/api/ai/group-context", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatId: activeChat, query: aiQuery, username: user.username }),
      });
      const data = await res.json();
      setAiResponse(data.answer || "I couldn't answer that right now.");
    } catch {
      setAiResponse("Failed to get answer from AI.");
    }
    setIsAskingAI(false);
  };

  // ── Copilot Panel ──────────────────────────────────────────────────────────
  const handlePanelQuery = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!panelInput.trim() || !user) return;
    const userMsg = { role: "user" as const, content: panelInput };
    setPanelMessages((prev) => [...prev, userMsg]);
    setPanelInput("");
    setIsPanelLoading(true);
    try {
      const res = await fetch("/api/ai/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chatId: activeChat,
          userId: user.username,
          query: userMsg.content,
          contextMessages: activeMessages.slice(-5),
        }),
      });
      const data = await res.json();
      setPanelMessages((prev) => [
        ...prev,
        { role: "ai", content: data.response || "No response received." },
      ]);
    } catch {
      setPanelMessages((prev) => [
        ...prev,
        { role: "ai", content: "Error connecting to AI assistant." },
      ]);
    }
    setIsPanelLoading(false);
  };

  // ── Memory ─────────────────────────────────────────────────────────────────
  const openMemoryAssistant = async () => {
    if (!user) return;
    setShowMemoryModal(true);
    setMemoryTab("replies");
    setPersonalizedReplies([]);
    fetchMemories();
    fetchPersonalizedReplies();
  };

  const fetchMemories = async () => {
    if (!user) return;
    setIsLoadingMemories(true);
    try {
      const res = await fetch(`/api/ai/memory?username=${encodeURIComponent(user.username)}`);
      const data = await res.json();
      setMemories(data.memories || []);
    } catch {
      setMemories([]);
    } finally {
      setIsLoadingMemories(false);
    }
  };

  const fetchPersonalizedReplies = async () => {
    if (!user || !activeChat) return;
    setIsPersonalizing(true);
    setPersonalizedReplies([]);
    try {
      const payload = activeMessages.slice(-10).map((m) => ({
        role: m.from === user.username ? "user" : "assistant",
        content: m.message,
      }));
      const res = await fetch("/api/ai/personalized-reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: payload, username: user.username }),
      });
      const data = await res.json();
      setPersonalizedReplies(data.replies || []);
    } catch {
      setPersonalizedReplies([]);
    } finally {
      setIsPersonalizing(false);
    }
  };

  const deleteMemory = async (id: string) => {
    if (!user) return;
    setDeletingId(id);
    try {
      await fetch(
        `/api/ai/memory?id=${id}&username=${encodeURIComponent(user.username)}`,
        { method: "DELETE" }
      );
      setMemories((prev) => prev.filter((m) => m.id !== id));
    } catch {
      // silent
    } finally {
      setDeletingId(null);
    }
  };

  // ── Semantic Search ────────────────────────────────────────────────────────
  const handleSemanticSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim() || !activeChat || !user) return;
    setIsSearching(true);
    setSearchResults([]);
    try {
      const res = await fetch("/api/search/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: searchQuery, activeChat, user: user.username }),
      });
      const data = await res.json();
      if (data.results) {
        setSearchResults(
          data.results.length
            ? data.results
            : [{ id: "none", message: "No semantically matching items found." }]
        );
      }
    } catch {
      setSearchResults([{ id: "err", from: "System", message: "Failed to search." }]);
    }
    setIsSearching(false);
  };

  // ── Helpers ────────────────────────────────────────────────────────────────
  const formatTime = (isoString?: string) => {
    if (!isoString) return "";
    return new Date(isoString).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  // ── Send Message ───────────────────────────────────────────────────────────
  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || !activeChat) return;
    sendMessage(activeChat, inputText);
    setInputText("");
    setPrediction("");
    setSmartReplies([]);
    sendTyping(activeChat, false);
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    if (predictionTimeoutRef.current) clearTimeout(predictionTimeoutRef.current);
  };

  // ── Typing Prediction ──────────────────────────────────────────────────────
  const fetchPrediction = async (text: string) => {
    if (!text.trim() || text.length < 5 || !activeChat || !user) {
      setPrediction("");
      return;
    }
    if (predictionCache.current[text]) {
      setPrediction(predictionCache.current[text]);
      return;
    }
    if (abortControllerRef.current) abortControllerRef.current.abort();
    abortControllerRef.current = new AbortController();
    try {
      const res = await fetch("/api/ai/predict", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          partialMessage: text,
          conversation: activeMessages.map((m) => ({
            role: m.from === user.username ? "user" : "assistant",
            content: m.message,
          })),
        }),
        signal: abortControllerRef.current.signal,
      });
      if (res.ok) {
        const data = await res.json();
        if (data.completion) {
          predictionCache.current[text] = data.completion;
          setPrediction(data.completion);
        } else {
          setPrediction("");
        }
      }
    } catch (err: any) {
      if (err?.name !== "AbortError") setPrediction("");
    }
  };

  const handleTyping = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const text = e.target.value;
    setInputText(text);
    if (!activeChat) return;
    sendTyping(activeChat, true);
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => sendTyping(activeChat, false), 2000);
    setPrediction("");
    if (predictionTimeoutRef.current) clearTimeout(predictionTimeoutRef.current);
    predictionTimeoutRef.current = setTimeout(() => fetchPrediction(text), 400);
  };

  // ── Start Chat ─────────────────────────────────────────────────────────────
  const handleStartChat = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");
    const targetInfo = newChatUser.trim();
    if (!targetInfo) return;
    if (targetInfo === user?.username) {
      setErrorMsg("Cannot chat with yourself.");
      return;
    }
    setIsChecking(true);
    const exists = await checkUser(targetInfo);
    setIsChecking(false);
    if (exists) {
      setActiveChat(targetInfo);
      setNewChatUser("");
      setErrorMsg("");
    } else {
      setErrorMsg("User does not exist.");
    }
  };

  if (!user) return null;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-[100dvh] w-full bg-[#0f0a14] overflow-hidden font-sans text-gray-100 selection:bg-purple-500/30">

      {/* ── Sidebar ── */}
      <div
        className={`
          w-full sm:w-[320px] md:w-[380px] bg-[#181124] border-r border-purple-900/30
          flex flex-col h-full z-30 transition-all duration-300 absolute sm:relative
          ${isSidebarOpen ? "translate-x-0" : "-translate-x-full sm:hidden"}
          ${activeChat && !isSidebarOpen ? "hidden sm:flex" : "flex"}
        `}
      >
        {/* Sidebar Header */}
        <div className="p-4 bg-[#120c1b] border-b border-purple-900/30 flex justify-between items-center h-[72px] shrink-0">
          <div className="flex items-center gap-3">
            <div className="relative">
              <UserCircle2 className="text-purple-500" size={36} />
              <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-[#120c1b] rounded-full" />
            </div>
            <div className="flex flex-col">
              <h2 className="text-[17px] font-bold text-white leading-tight truncate max-w-[120px]">
                {user.username}
              </h2>
              <span className="text-[11px] text-green-400 font-medium">Online</span>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <div className="relative group">
              <button className="p-2.5 bg-purple-900/20 text-purple-300 rounded-2xl hover:bg-purple-900/40 transition active:scale-95 flex items-center gap-2">
                <Globe size={18} />
                <span className="text-[11px] font-bold uppercase tracking-wider">{userLanguage}</span>
              </button>
              <div className="absolute right-0 top-full mt-2 w-48 bg-[#181124] border border-purple-800/30 rounded-2xl shadow-2xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-[60] p-1.5 backdrop-blur-xl">
                <div className="text-[10px] font-black p-2 text-purple-500 uppercase tracking-widest">
                  Select Language
                </div>
                {[
                  { code: "en", name: "English" },
                  { code: "hi", name: "Hindi" },
                  { code: "es", name: "Spanish" },
                  { code: "fr", name: "French" },
                  { code: "gu", name: "Gujarati" },
                  { code: "de", name: "German" },
                ].map((lang) => (
                  <button
                    key={lang.code}
                    onClick={() => updateLanguage(lang.code)}
                    className={`w-full text-left px-3 py-2 rounded-xl text-xs font-bold transition flex items-center justify-between ${
                      userLanguage === lang.code
                        ? "bg-purple-600 text-white"
                        : "text-gray-400 hover:bg-purple-900/40 hover:text-white"
                    }`}
                  >
                    {lang.name}
                    {userLanguage === lang.code && <Check size={12} />}
                  </button>
                ))}
              </div>
            </div>
            <button
              onClick={logout}
              className="p-2.5 bg-purple-900/20 text-purple-300 rounded-2xl hover:bg-purple-900/60 transition active:scale-95"
              title="Logout"
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>

        {/* Invite User */}
        <div className="p-4 bg-[#160f22] space-y-3">
          <form onSubmit={handleStartChat} className="flex flex-col gap-2 relative">
            <div className="flex gap-2">
              <div className="relative flex-1 group">
                <Search
                  size={14}
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 text-purple-900 group-focus-within:text-purple-400 transition"
                />
                <input
                  className="w-full pl-10 pr-4 py-3 bg-[#0f0a14] border border-purple-800/20 text-gray-200 rounded-2xl text-[14px] outline-none focus:border-purple-500/50 focus:ring-4 focus:ring-purple-500/5 transition shadow-sm"
                  placeholder="Invite user..."
                  value={newChatUser}
                  onChange={(e) => { setNewChatUser(e.target.value); setErrorMsg(""); }}
                />
              </div>
              <button
                disabled={isChecking || !newChatUser.trim()}
                type="submit"
                className="px-4 py-3 bg-purple-600 text-white rounded-2xl text-sm hover:bg-purple-500 disabled:opacity-50 transition flex items-center justify-center shrink-0 w-12 active:scale-90 shadow-lg shadow-purple-900/20"
              >
                {isChecking
                  ? <Loader2 size={18} className="animate-spin" />
                  : <UserPlus size={18} />
                }
              </button>
            </div>
            {errorMsg && (
              <span className="text-red-400 text-[11px] font-medium tracking-wide animate-in fade-in slide-in-from-top-1 ml-1">
                {errorMsg}
              </span>
            )}
          </form>
        </div>

        {/* Contact List */}
        <div className="flex-1 overflow-y-auto custom-scrollbar bg-[#181124]">
          <ul className="divide-y divide-purple-900/10">
            {/* AI Assistant */}
            <li>
              <button
                onClick={() => setActiveChat("AI Assistant")}
                className={`w-full text-left px-5 py-4 hover:bg-indigo-900/10 flex items-center gap-4 transition-all duration-200 relative group ${
                  activeChat === "AI Assistant"
                    ? "bg-indigo-900/20 shadow-[inset_4px_0_0_0_rgba(79,70,229,1)]"
                    : ""
                }`}
              >
                <div className="relative shrink-0">
                  <div className="w-[52px] h-[52px] bg-gradient-to-br from-indigo-600 via-indigo-500 to-purple-600 rounded-full flex items-center justify-center text-white font-black text-xl shadow-md border border-indigo-500/10 group-hover:scale-105 transition">
                    <Brain size={26} />
                  </div>
                  <div className="absolute bottom-0 right-0 w-4 h-4 bg-green-500 border-[3px] border-[#181124] rounded-full shadow-[0_0_10px_rgba(34,197,94,0.5)]" />
                </div>
                <div className="flex-1 overflow-hidden">
                  <div className="flex justify-between items-center mb-1">
                    <p className="font-black text-indigo-400 truncate text-[16px] uppercase tracking-tighter">
                      AI Assistant
                    </p>
                    <span className="text-[9px] font-black bg-indigo-600/20 text-indigo-500 px-1.5 py-0.5 rounded uppercase tracking-widest">
                      Bot
                    </span>
                  </div>
                  <p className="text-[13px] text-gray-500 truncate font-medium">
                    Your personal intelligence synapse
                  </p>
                </div>
              </button>
            </li>

            {/* Contacts */}
            {contactsDetails.map(({ username, lastMessage, unreadCount }) => (
              <li key={username}>
                <button
                  onClick={() => setActiveChat(username)}
                  className={`w-full text-left px-5 py-4 hover:bg-purple-900/10 flex items-center gap-4 transition-all duration-200 relative group ${
                    activeChat === username
                      ? "bg-purple-900/20 shadow-[inset_4px_0_0_0_rgba(168,85,247,1)]"
                      : ""
                  }`}
                >
                  <div className="relative shrink-0">
                    <div className="w-[52px] h-[52px] bg-gradient-to-br from-purple-800 via-purple-700 to-indigo-600 rounded-full flex items-center justify-center text-white font-black text-xl shadow-md border border-purple-500/10 group-hover:scale-105 transition">
                      {username[0].toUpperCase()}
                    </div>
                    {onlineStatuses[username] && (
                      <div className="absolute bottom-0 right-0 w-4 h-4 bg-green-500 border-[3px] border-[#181124] rounded-full" />
                    )}
                  </div>
                  <div className="flex-1 overflow-hidden">
                    <div className="flex justify-between items-center mb-1">
                      <p className="font-bold text-gray-100 truncate text-[16px]">{username}</p>
                      <span className={`text-[11px] font-medium ${unreadCount > 0 ? "text-purple-400" : "text-gray-500"}`}>
                        {formatTime(lastMessage?.timestamp)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center gap-2">
                      <p className={`text-[13px] truncate flex-1 min-w-0 ${
                        typingUsers[username]
                          ? "text-purple-400 font-semibold italic animate-pulse"
                          : "text-gray-400"
                      }`}>
                        {typingUsers[username]
                          ? "typing..."
                          : lastMessage ? lastMessage.message : "Start chatting"
                        }
                      </p>
                      {unreadCount > 0 && activeChat !== username && (
                        <div className="bg-purple-600 text-[10px] font-black rounded-full px-2 py-0.5 text-white flex items-center justify-center shadow-lg shadow-purple-900/40">
                          {unreadCount > 9 ? "9+" : unreadCount}
                        </div>
                      )}
                    </div>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* ── Chat Container ── */}
      <div className={`flex-1 chat-column bg-[#0f0a14] relative transition-all duration-300 ${!activeChat ? "hidden sm:flex" : ""}`}>
        {activeChat ? (
          <>
            {/* ── Header ── */}
            <header className="px-2 sm:px-4 py-3 bg-[#181124] border-b border-purple-900/30 flex items-center h-[72px] shrink-0 z-20 justify-between gap-2">
              {/* Left: back + avatar + name */}
              <div className="flex items-center gap-2 min-w-0 flex-shrink-0">
                <button
                  className="p-2 text-purple-400 hover:text-white transition sm:hidden flex-shrink-0"
                  onClick={() => setIsSidebarOpen(true)}
                >
                  <Menu size={20} />
                </button>
                <div className={`w-10 h-10 sm:w-11 sm:h-11 bg-gradient-to-tr ${
                  activeChat === "AI Assistant"
                    ? "from-indigo-600 to-indigo-400 shadow-indigo-900/40"
                    : "from-purple-800 to-purple-600 shadow-purple-900/40"
                } rounded-2xl flex items-center justify-center text-white font-black text-base sm:text-lg shadow-lg border border-white/10 flex-shrink-0`}>
                  {activeChat === "AI Assistant" ? <Brain size={20} /> : activeChat[0].toUpperCase()}
                </div>
                <div className="flex flex-col min-w-0">
                  <h3 className="font-black text-[14px] sm:text-[17px] text-white leading-tight tracking-tight truncate max-w-[80px] xs:max-w-[100px] sm:max-w-none">
                    {activeChat === "AI Assistant" ? "Personal Synapse" : activeChat}
                  </h3>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <div className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)] flex-shrink-0" />
                    <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-green-400 truncate">
                      {activeChat === "AI Assistant"
                        ? "Ready"
                        : typingUsers[activeChat]
                          ? "typing..."
                          : onlineStatuses[activeChat] ? "Online" : "Offline"
                      }
                    </span>
                  </div>
                </div>
              </div>

              {/* Right: ALL 8 action icons — always visible */}
              <div className="flex items-center flex-shrink-0" style={{ gap: "1px" }}>
                {/* 1. Memory / Brain */}
                <button
                  onClick={openMemoryAssistant}
                  title="AI Memories"
                  className="action-icon-btn text-purple-400 hover:text-white hover:bg-purple-900/40 transition active:scale-95"
                >
                  <Brain size={17} />
                </button>

                {/* 2. Filter / Important */}
                <button
                  onClick={() => setImportantOnly((v) => !v)}
                  title="Toggle Importance"
                  className={`action-icon-btn relative transition active:scale-95 ${
                    importantOnly
                      ? "bg-amber-500/20 text-amber-400 shadow-[inset_0_0_12px_rgba(245,158,11,0.1)]"
                      : "text-purple-400 hover:bg-purple-900/40"
                  }`}
                >
                  <Filter size={17} />
                  {!importantOnly && activeMessages.filter((m) => m.isImportant).length > 0 && (
                    <div className="absolute top-0.5 right-0.5 w-2 h-2 bg-amber-500 rounded-full animate-ping" />
                  )}
                </button>

                {/* 3. Copilot / Zap */}
                <button
                  onClick={() => setIsAIPanelOpen(!isAIPanelOpen)}
                  title="AI Copilot Sidebar"
                  className={`action-icon-btn transition active:scale-95 ${
                    isAIPanelOpen
                      ? "bg-indigo-600/30 text-indigo-400"
                      : "text-purple-400 hover:bg-purple-900/40"
                  }`}
                >
                  <Zap size={17} />
                </button>

                {/* 4. Ask AI / HelpCircle */}
                <button
                  onClick={() => setIsAskAIOpen(true)}
                  title="Quick AI Context (Pulse)"
                  className="action-icon-btn text-purple-400 hover:text-white hover:bg-purple-900/40 transition active:scale-95"
                >
                  <HelpCircle size={17} />
                </button>

                {/* 5. Summarize / Sparkles */}
                <button
                  onClick={() => fetchSummary()}
                  title="Summarize"
                  className="action-icon-btn text-purple-400 hover:text-white hover:bg-purple-900/40 transition active:scale-95"
                >
                  <Sparkles size={17} />
                </button>

                {/* 6. Search */}
                <button
                  onClick={() => setShowSearch(!showSearch)}
                  title="Vector Search"
                  className={`action-icon-btn transition active:scale-95 ${
                    showSearch
                      ? "bg-purple-600/30 text-purple-200 shadow-inner"
                      : "text-purple-400 hover:bg-purple-900/40"
                  }`}
                >
                  <Search size={17} />
                </button>

                {/* 7. Delete Chat / Trash */}
                <button
                  onClick={() => {
                    if (
                      confirm(
                        `Are you sure you want to delete the entire chat with ${activeChat}? This will only hide it for you.`
                      )
                    ) {
                      if (user) deleteChat(user.username, activeChat);
                      setActiveChat(null);
                    }
                  }}
                  title="Delete Chat"
                  className="action-icon-btn text-red-500/50 hover:text-red-500 hover:bg-red-500/10 transition active:scale-95"
                >
                  <Trash2 size={17} />
                </button>
              </div>
            </header>

            {/* ── Semantic Search Overlay ── */}
            {showSearch && (
              <div className="absolute top-[72px] left-0 right-0 z-[25] p-3 flex justify-center animate-in slide-in-from-top duration-300">
                <div className="w-full max-w-2xl bg-[#120c1b]/95 backdrop-blur-xl border border-purple-800/30 rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] overflow-hidden">
                  <form
                    onSubmit={handleSemanticSearch}
                    className="flex gap-2 p-3 bg-[#1a1126]/60 border-b border-purple-900/20"
                  >
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="flex-1 bg-transparent border-none text-gray-200 px-4 py-2.5 text-[15px] outline-none placeholder-purple-800/40"
                      placeholder="Smart Search (e.g. 'project updates')..."
                      autoFocus
                    />
                    <button
                      type="submit"
                      disabled={isSearching || !searchQuery.trim()}
                      className="bg-purple-600 text-white rounded-2xl px-6 hover:bg-purple-500 disabled:opacity-40 transition font-bold text-sm shadow-lg shadow-purple-900/40 flex items-center gap-2"
                    >
                      {isSearching ? <Loader2 size={16} className="animate-spin" /> : <><Zap size={16} /> Search</>}
                    </button>
                  </form>
                  {searchResults.length > 0 && (
                    <div className="max-h-[350px] overflow-y-auto custom-scrollbar p-2 divide-y divide-purple-900/10">
                      {searchResults.map((res, i) => (
                        <div key={res.id || i} className="p-4 hover:bg-purple-900/5 transition group rounded-2xl">
                          <div className="flex justify-between items-center mb-1.5">
                            <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-md ${
                              res.from === user.username
                                ? "bg-indigo-900/30 text-indigo-400"
                                : "bg-purple-900/30 text-purple-400"
                            }`}>
                              {res.from === user.username ? "Me" : res.from || "Partner"}
                            </span>
                            {res.similarity && (
                              <span className="text-[10px] font-mono text-green-400 tracking-tighter">
                                {(res.similarity * 100).toFixed(1)}% match
                              </span>
                            )}
                          </div>
                          <p className="text-[13px] text-gray-300 leading-relaxed group-hover:text-white transition">
                            {res.message}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ── Messages Area ── */}
            <main className="chat-messages custom-scrollbar bg-[#0f0a14] relative chat-background">
              <div className="max-w-4xl mx-auto w-full px-4 py-6 flex flex-col gap-6">
                {importantOnly && activeMessages.filter((m) => m.isImportant).length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 opacity-30 select-none">
                    <Filter size={64} className="mb-4" />
                    <p className="font-black text-lg uppercase tracking-[0.2em]">No Important Meta</p>
                  </div>
                ) : (
                  activeMessages
                    .filter((msg) => !importantOnly || msg.isImportant)
                    .map((msg, index, arr) => {
                      const isMe = msg.from === user.username;
                      const isAI = msg.isAI || msg.from === "AI Assistant";
                      const isImportant = msg.isImportant;
                      const type = msg.msgType || "normal";
                      const emotion = msg.emotion as EmotionType;
                      const emoji =
                        emotion === "happy" ? "😊"
                        : emotion === "excited" ? "🤩"
                        : emotion === "sad" ? "😞"
                        : emotion === "angry" ? "😡"
                        : emotion === "frustrated" ? "😤"
                        : "";
                      const isContinue = arr[index - 1]?.from === msg.from;

                      return (
                        <div
                          key={msg.id || index}
                          className={`flex w-full ${isMe ? "justify-end" : "justify-start"} ${isContinue ? "-mt-4" : "mt-1"}`}
                        >
                          <div className={`flex flex-col max-w-[85%] md:max-w-[70%] group ${isMe ? "items-end" : "items-start"}`}>
                            {isAI && (
                              <div className="flex items-center gap-1.5 mb-1.5">
                                <div className="w-6 h-6 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-500 flex items-center justify-center shadow-lg shadow-indigo-900/20">
                                  <Brain size={12} className="text-white" />
                                </div>
                                <span className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">
                                  Assistant Synapse
                                </span>
                              </div>
                            )}
                            {isImportant && type !== "normal" && (
                              <div className="flex items-center gap-1.5 mb-1 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-lg">
                                <span className="text-[9px] font-black text-amber-500 uppercase tracking-widest">
                                  {type}
                                </span>
                                {msg.confidence !== undefined && msg.confidence > 0 && (
                                  <span className="text-[8px] text-amber-500/60">
                                    {Math.round(msg.confidence * 100)}%
                                  </span>
                                )}
                              </div>
                            )}
                            <div
                              className={`relative px-4 py-2.5 shadow-sm transition-all duration-300 group-hover:shadow-[0_4px_20px_rgba(0,0,0,0.15)]
                                ${isMe
                                  ? "bg-[#5b3eb3] text-white rounded-[24px] rounded-tr-none border border-white/5"
                                  : isAI
                                    ? "bg-gradient-to-br from-[#2a1b4d]/95 to-[#1a1126]/95 text-indigo-50 border border-indigo-500/20 rounded-[24px] rounded-tl-none shadow-[0_10px_25px_-5px_rgba(79,70,229,0.1)]"
                                    : "bg-[#251838]/80 text-gray-100 border border-purple-800/10 rounded-[24px] rounded-tl-none backdrop-blur-sm"
                                }
                                ${isImportant ? "ring-2 ring-amber-500/40 ring-offset-2 ring-offset-[#0f0a14]" : ""}
                                ${emoji ? "mt-4" : ""}
                              `}
                            >
                              {emoji && (
                                <div
                                  className="absolute -top-6 left-2 text-xl filter drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)] select-none cursor-default hover:scale-125 transition active:scale-95 z-10"
                                  title={`${emotion} tone detected`}
                                >
                                  {emoji}
                                </div>
                              )}

                              <div className="flex flex-col pr-10">
                                {editingId === msg.id ? (
                                  <div className="flex flex-col gap-2 min-w-[200px]">
                                    <textarea
                                      autoFocus
                                      className="bg-purple-900/30 border border-purple-500/30 rounded-xl p-2 text-sm text-white outline-none focus:border-purple-400"
                                      value={editingText}
                                      onChange={(e) => setEditingText(e.target.value)}
                                      onKeyDown={(e) => {
                                        if (e.key === "Enter" && !e.shiftKey) {
                                          e.preventDefault();
                                          editMessage(msg.id, user.username, editingText);
                                          setEditingId(null);
                                        } else if (e.key === "Escape") {
                                          setEditingId(null);
                                        }
                                      }}
                                    />
                                    <div className="flex justify-end gap-2 text-[10px] font-black uppercase">
                                      <button onClick={() => setEditingId(null)} className="text-gray-400">
                                        Cancel
                                      </button>
                                      <button
                                        onClick={() => {
                                          editMessage(msg.id, user.username, editingText);
                                          setEditingId(null);
                                        }}
                                        className="text-purple-300"
                                      >
                                        Save
                                      </button>
                                    </div>
                                  </div>
                                ) : (
                                  <>
                                    <p className={`text-[15px] leading-relaxed break-words whitespace-pre-wrap ${msg.isDeleted ? "italic opacity-60" : ""}`}>
                                      {showOriginal[msg.id]
                                        ? msg.message
                                        : msg.translated || msg.message
                                      }
                                    </p>
                                    {msg.isEdited && !msg.isDeleted && (
                                      <span className="text-[9px] font-bold text-gray-500 uppercase tracking-tighter mt-0.5">
                                        edited
                                      </span>
                                    )}
                                  </>
                                )}

                                {msg.translated && msg.translated !== msg.message && !msg.isDeleted && (
                                  <button
                                    onClick={() =>
                                      setShowOriginal((prev) => ({ ...prev, [msg.id]: !prev[msg.id] }))
                                    }
                                    className={`mt-1.5 flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider transition ${
                                      isMe
                                        ? "text-purple-300/60 hover:text-white"
                                        : "text-purple-400 hover:text-purple-300"
                                    }`}
                                  >
                                    <Languages size={10} />
                                    {showOriginal[msg.id] ? "View Translation" : "View Original"}
                                  </button>
                                )}
                              </div>

                              {!msg.isDeleted && isMe && editingId !== msg.id && (
                                <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <button
                                    onClick={() => { setEditingId(msg.id); setEditingText(msg.message); }}
                                    className="p-1 hover:bg-white/10 rounded text-purple-200"
                                    title="Edit"
                                  >
                                    <Edit3 size={12} />
                                  </button>
                                  <button
                                    onClick={() => {
                                      if (confirm("Delete this message?"))
                                        deleteMessage(msg.id, user.username);
                                    }}
                                    className="p-1 hover:bg-white/10 rounded text-red-300"
                                    title="Delete"
                                  >
                                    <Trash2 size={12} />
                                  </button>
                                </div>
                              )}

                              <div className="absolute bottom-1.5 right-3 flex items-center gap-1.5 select-none pointer-events-none">
                                <span className={`text-[10px] font-bold ${isMe ? "text-purple-200/60" : "text-gray-500"}`}>
                                  {formatTime(msg.timestamp)}
                                </span>
                                {isMe && (
                                  <div className="flex">
                                    {msg.status === "read"
                                      ? <CheckCheck size={13} className="text-cyan-400 stroke-[3px]" />
                                      : msg.status === "delivered"
                                        ? <CheckCheck size={13} className="text-gray-400 opacity-60 ml-0.5" />
                                        : <Check size={13} className="text-gray-400 opacity-40" />
                                    }
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })
                )}
                <div ref={chatEndRef} className="h-4" />
              </div>
            </main>

            {/* ── Input Footer ── */}
            <footer className="bg-[#120c1b] border-t border-purple-900/30 p-2 sm:p-4 shrink-0">
              <div className="max-w-4xl mx-auto space-y-2">
                {/* Smart Replies — horizontally scrollable, never causes layout shift */}
                <div className="w-full relative">
                  <div className="overflow-x-auto overflow-y-hidden max-h-[52px] scroll-smooth"
                    style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                    {isGeneratingReplies ? (
                      <div className="flex gap-2 pb-1" style={{ minWidth: 'max-content' }}>
                        <div className="h-10 w-24 bg-purple-900/20 border border-purple-800/10 rounded-2xl animate-pulse flex-shrink-0" />
                        <div className="h-10 w-32 bg-purple-900/20 border border-purple-800/10 rounded-2xl animate-pulse flex-shrink-0" />
                        <div className="h-10 w-28 bg-purple-900/20 border border-purple-800/10 rounded-2xl animate-pulse flex-shrink-0" />
                      </div>
                    ) : smartReplies.length > 0 && (
                      <div className="flex gap-2 pb-1 animate-in fade-in slide-in-from-bottom-2" style={{ minWidth: 'max-content' }}>
                        <button
                          onClick={() => fetchSmartReplies(activeMessages)}
                          className="flex-shrink-0 w-10 h-10 flex items-center justify-center bg-purple-900/20 text-purple-400 rounded-2xl hover:bg-purple-900/40 border border-purple-800/20 transition active:scale-90"
                        >
                          <RefreshCw size={14} />
                        </button>
                        {smartReplies.map((reply, i) => (
                          <button
                            key={i}
                            onClick={() => setInputText(reply)}
                            className="flex-shrink-0 px-5 py-2.5 bg-[#1a1126] border border-purple-800/20 text-purple-300 text-[13px] font-bold rounded-2xl whitespace-nowrap hover:bg-purple-900/50 hover:text-white transition active:scale-95 shadow-sm border-b-2 border-b-purple-500/10"
                          >
                            {reply}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Input Form */}
                <form onSubmit={handleSend} className="flex gap-3 items-end">
                  <div className="flex-1 min-w-0 bg-[#1a1126] border border-purple-800/20 rounded-[28px] px-5 shadow-inner focus-within:border-purple-500/40 transition relative">
                    {prediction && (
                      <div className="absolute top-0 left-0 right-0 px-5 py-[15px] pointer-events-none text-[15px] font-medium leading-relaxed break-words whitespace-pre-wrap select-none opacity-30 h-full overflow-hidden">
                        <span className="text-transparent">{inputText}</span>
                        <span className="text-gray-300">{prediction}</span>
                      </div>
                    )}
                    <textarea
                      rows={1}
                      value={inputText}
                      onChange={(e) => {
                        handleTyping(e);
                        e.target.style.height = "auto";
                        e.target.style.height = e.target.scrollHeight + "px";
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Tab" && prediction) {
                          e.preventDefault();
                          const fullText = inputText + prediction;
                          setInputText(fullText);
                          setPrediction("");
                          setTimeout(() => {
                            if (e.currentTarget) {
                              e.currentTarget.style.height = "auto";
                              e.currentTarget.style.height = e.currentTarget.scrollHeight + "px";
                            }
                          }, 0);
                        } else if (e.key === "Escape") {
                          setPrediction("");
                        } else if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          handleSend(e as unknown as React.FormEvent);
                        }
                      }}
                      className="w-full bg-transparent border-none text-gray-100 py-[15px] text-[15px] outline-none resize-none overflow-hidden max-h-32 placeholder-gray-600 block relative z-10"
                      placeholder="Send a secure message..."
                    />
                  </div>
                  <button
                    disabled={!inputText.trim()}
                    type="submit"
                    className="w-14 h-14 bg-purple-600 text-white rounded-full flex items-center justify-center hover:bg-purple-500 disabled:bg-gray-800 disabled:text-gray-600 transition shadow-2xl shadow-purple-900/40 active:scale-95 shrink-0"
                  >
                    <Send size={24} className="ml-1 -mt-0.5" />
                  </button>
                </form>
              </div>
            </footer>
          </>
        ) : (
          /* ── Empty State ── */
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8 bg-[#0f0a14] relative chat-background">
            <div className="absolute inset-0 bg-gradient-to-b from-purple-950/5 to-transparent" />
            <div className="relative z-10 animate-in zoom-in-95 duration-1000">
              <div className="w-32 h-32 bg-purple-900/10 border border-purple-800/20 rounded-full flex items-center justify-center mx-auto mb-8 shadow-[0_0_80px_rgba(147,51,234,0.1)]">
                <MessageSquare size={60} className="text-purple-600/30" />
              </div>
              <h2 className="text-3xl font-black text-white/90 mb-4 tracking-tight">
                Vortex Intelligence Node
              </h2>
              <p className="text-gray-500 max-w-sm mx-auto leading-relaxed text-[15px]">
                Select a user from the directory to initiate a secure, AI-monitored data stream.
              </p>
              <button
                onClick={() => setIsSidebarOpen(true)}
                className="mt-8 px-8 py-3.5 bg-[#181124] border border-purple-900/30 rounded-2xl text-purple-400 font-black text-sm uppercase tracking-widest hover:border-purple-500 hover:text-white transition active:scale-95 sm:hidden"
              >
                Open Directory
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Summary Modal ── */}
      {showSummaryModal && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200"
          onClick={(e) => { if (e.target === e.currentTarget) setShowSummaryModal(false); }}
        >
          <div className="w-full max-w-lg bg-[#181124] border border-purple-800/30 rounded-[32px] overflow-hidden shadow-2xl animate-in zoom-in-95">
            <div className="px-8 py-6 border-b border-purple-900/20 flex justify-between items-center bg-gradient-to-r from-purple-900/20 to-transparent">
              <div className="flex items-center gap-3">
                <Sparkles className="text-purple-400" size={24} />
                <h3 className="font-black text-xl text-white">Neural Briefing</h3>
              </div>
              <button
                onClick={() => setShowSummaryModal(false)}
                className="p-2 text-gray-500 hover:text-white bg-purple-900/10 rounded-full transition"
              >
                <X size={20} />
              </button>
            </div>
            <div className="p-8 max-h-[60vh] overflow-y-auto custom-scrollbar">
              {isSummarizing ? (
                <div className="flex flex-col items-center py-12 gap-6">
                  <div className="relative">
                    <div className="w-16 h-16 rounded-full border-4 border-purple-900/30 border-t-purple-500 animate-spin" />
                    <Sparkles size={20} className="absolute inset-0 m-auto text-purple-400 animate-pulse" />
                  </div>
                  <p className="text-purple-400 font-bold uppercase tracking-widest text-sm animate-pulse">
                    Syncing nodes...
                  </p>
                </div>
              ) : summaryError ? (
                <div className="p-4 bg-red-900/20 border border-red-800/30 rounded-2xl text-red-400 text-sm">
                  {summaryError}
                </div>
              ) : (
                <div className="space-y-4">
                  {summary.split("\n").filter((l) => l.trim()).map((l, i) => (
                    <div key={i} className="flex gap-4 text-[15px] text-gray-200 leading-relaxed font-medium">
                      <div className="w-2.5 h-2.5 rounded-full bg-purple-600 mt-2 shrink-0 animate-pulse" />
                      {l.replace(/^[•\-*]\s*/, "")}
                    </div>
                  ))}
                  {summaryMeta && (
                    <div className="mt-8 pt-4 border-t border-purple-900/10 flex justify-between items-center text-[10px] font-black uppercase text-gray-600">
                      <span>{summaryMeta.messageCount} Fragments Processed</span>
                      <span>Synced {new Date(summaryMeta.updatedAt).toLocaleTimeString()}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="p-6 bg-[#1a1126]/60 flex justify-end">
              <button
                onClick={() => fetchSummary(true)}
                className="px-6 py-2.5 bg-purple-600/10 border border-purple-600/30 text-purple-400 rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-purple-600 hover:text-white transition"
              >
                Full Refresh
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Memory Assistant Modal ── */}
      {showMemoryModal && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200"
          onClick={(e) => { if (e.target === e.currentTarget) setShowMemoryModal(false); }}
        >
          <div className="w-full max-w-2xl h-[80vh] bg-[#120c1b] border border-purple-800/30 rounded-[40px] overflow-hidden shadow-2xl flex flex-col animate-in slide-in-from-bottom-8">
            <div className="px-8 py-6 border-b border-indigo-900/30 flex justify-between items-center bg-gradient-to-r from-indigo-900/30 to-transparent shrink-0">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-indigo-600/20 border border-indigo-500/30 rounded-2xl flex items-center justify-center shadow-inner">
                  <Brain size={28} className="text-indigo-400" />
                </div>
                <div>
                  <h3 className="font-black text-xl text-white tracking-tight">AI Identity Core</h3>
                  <p className="text-[11px] font-bold text-indigo-400 uppercase tracking-[0.2em] mt-1">
                    Cross-Reference Active
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowMemoryModal(false)}
                className="p-2.5 text-gray-500 hover:text-white bg-indigo-900/10 rounded-full transition active:scale-95"
              >
                <X size={22} />
              </button>
            </div>

            <div className="flex border-b border-purple-900/10 bg-[#150f22] shrink-0 p-1">
              <button
                onClick={() => setMemoryTab("replies")}
                className={`flex-1 py-4 text-xs font-black uppercase tracking-widest transition rounded-3xl ${
                  memoryTab === "replies"
                    ? "text-indigo-400 bg-indigo-900/20 shadow-inner"
                    : "text-gray-600 hover:text-gray-400"
                }`}
              >
                Predictions
              </button>
              <button
                onClick={() => { setMemoryTab("memories"); fetchMemories(); }}
                className={`flex-1 py-4 text-xs font-black uppercase tracking-widest transition rounded-3xl ${
                  memoryTab === "memories"
                    ? "text-indigo-400 bg-indigo-900/20 shadow-inner"
                    : "text-gray-600 hover:text-gray-400"
                }`}
              >
                Synapses ({memories.length})
              </button>
            </div>

            <div className="flex-1 p-8 overflow-y-auto custom-scrollbar">
              {memoryTab === "replies" ? (
                isPersonalizing ? (
                  <div className="flex flex-col items-center justify-center h-full gap-6">
                    <Loader2 size={48} className="animate-spin text-indigo-500" />
                    <p className="text-indigo-400/50 font-black uppercase text-xs tracking-[0.3em] animate-pulse">
                      Modeling Identity...
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {personalizedReplies.length > 0
                      ? personalizedReplies.map((r, i) => (
                          <button
                            key={i}
                            onClick={() => { setInputText(r); setShowMemoryModal(false); }}
                            className="w-full text-left p-5 rounded-[24px] bg-[#1a1126] border border-indigo-800/10 text-gray-200 text-[15px] font-medium hover:bg-indigo-900/20 hover:border-indigo-500/50 transition group flex gap-4 items-start active:scale-[0.99]"
                          >
                            <span className="shrink-0 w-8 h-8 rounded-full bg-indigo-600/10 border border-indigo-600/20 flex items-center justify-center text-[10px] font-black text-indigo-400 group-hover:bg-indigo-600 group-hover:text-white transition">
                              {i + 1}
                            </span>
                            {r}
                          </button>
                        ))
                      : (
                        <div className="flex flex-col items-center justify-center h-64 text-gray-700 opacity-20">
                          <Brain size={80} />
                          <p className="mt-4 font-black uppercase">No Data Found</p>
                        </div>
                      )
                    }
                  </div>
                )
              ) : (
                isLoadingMemories
                  ? <div className="flex justify-center py-12"><Loader2 size={32} className="animate-spin text-indigo-400" /></div>
                  : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {memories.map((m) => (
                        <div
                          key={m.id}
                          className="p-5 bg-[#1a1126] border border-indigo-900/10 rounded-3xl flex justify-between items-start group relative hover:border-indigo-500/30 transition"
                        >
                          <div className="flex-1 pr-6 flex flex-col gap-2">
                            <span className={`text-[9px] font-black uppercase tracking-widest w-fit px-2 py-0.5 rounded-md border ${
                              m.category === "preference"
                                ? "bg-purple-900/40 text-purple-400 border-purple-800/40"
                                : "bg-indigo-900/40 text-indigo-400 border-indigo-800/40"
                            }`}>
                              {m.category}
                            </span>
                            <p className="text-[13px] text-gray-200 leading-relaxed font-medium">{m.content}</p>
                          </div>
                          <button
                            onClick={() => deleteMemory(m.id)}
                            className="absolute top-4 right-4 p-2 text-gray-700 hover:text-red-400 transition opacity-0 group-hover:opacity-100 bg-[#0f0a14] rounded-full shadow-xl"
                          >
                            {deletingId === m.id
                              ? <Loader2 size={14} className="animate-spin" />
                              : <Trash2 size={14} />
                            }
                          </button>
                        </div>
                      ))}
                      {memories.length === 0 && (
                        <p className="col-span-full text-center text-gray-800 font-black uppercase text-xs py-20 tracking-tighter opacity-10">
                          Historical Cache Empty
                        </p>
                      )}
                    </div>
                  )
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Global Styles ── */}
      <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; height: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(147, 51, 234, 0.2); border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(147, 51, 234, 0.4); }
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        .chat-background {
          background-image:
            radial-gradient(circle at 50% 50%, rgba(147, 51, 234, 0.05) 0%, transparent 100%),
            linear-gradient(rgba(15, 10, 20, 0.95), rgba(15, 10, 20, 0.95));
        }

        /*
         * ── Action icon buttons: ALL 7 always visible at every screen size ──
         * Uses padding + min/max sizing to shrink gracefully on small screens
         * without ever hiding any button via display:none or overflow:hidden.
         */
        .action-icon-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          border-radius: 14px;
          border: none;
          background: transparent;
          cursor: pointer;
          position: relative;
          /* Default (≥ 640px) */
          width: 38px;
          height: 38px;
          padding: 9px;
        }

        /* 480px – 639px */
        @media (max-width: 639px) {
          .action-icon-btn {
            width: 32px;
            height: 32px;
            padding: 7px;
            border-radius: 10px;
          }
        }

        /* ≤ 400px — extra tight */
        @media (max-width: 400px) {
          .action-icon-btn {
            width: 28px;
            height: 28px;
            padding: 5px;
            border-radius: 8px;
          }
        }

        /* ≤ 340px — absolute minimum */
        @media (max-width: 340px) {
          .action-icon-btn {
            width: 26px;
            height: 26px;
            padding: 4px;
            border-radius: 7px;
          }
        }
      `}</style>

      {/* ── AI Context Modal (Ask AI) ── */}
      {isAskAIOpen && (
        <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-300">
          <div className="w-full max-w-lg bg-[#120c1b] border border-purple-800/30 rounded-[40px] shadow-[0_30px_60px_-12px_rgba(0,0,0,0.8)] overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-8 border-b border-purple-900/10 flex justify-between items-start bg-[#1a1126]/40">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-3xl bg-gradient-to-br from-indigo-600 to-purple-600 flex items-center justify-center shadow-xl shadow-indigo-900/30 ring-4 ring-indigo-900/10">
                  <HelpCircle size={28} className="text-white" />
                </div>
                <div>
                  <h3 className="font-black text-2xl text-white tracking-tight leading-none">Context Pulse</h3>
                  <p className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.3em] mt-2 flex items-center gap-1.5">
                    <RefreshCw size={10} className="animate-spin" /> Analyzing Group Context
                  </p>
                </div>
              </div>
              <button
                onClick={() => { setIsAskAIOpen(false); setAiQuery(""); setAiResponse(""); }}
                className="p-2.5 text-gray-500 hover:text-white bg-white/5 rounded-full transition active:scale-95"
              >
                <X size={22} />
              </button>
            </div>

            <div className="flex-1 p-8 overflow-y-auto no-scrollbar">
              {!aiResponse && !isAskingAI ? (
                <div className="flex flex-col gap-6 animate-in slide-in-from-bottom-4 duration-500">
                  <p className="text-gray-400 text-[15px] font-medium leading-relaxed italic border-l-2 border-indigo-500/30 pl-4">
                    "What did the team decide about architectural patterns?"
                  </p>
                  <form onSubmit={handleAskAI} className="relative">
                    <input
                      autoFocus
                      type="text"
                      className="w-full bg-[#1a1126] border-2 border-indigo-900/20 rounded-3xl px-6 py-5 text-white text-lg placeholder-indigo-800/30 outline-none focus:border-indigo-500/50 focus:ring-4 focus:ring-indigo-500/10 transition-all font-medium pr-16 shadow-inner"
                      placeholder="Ask the AI about this conversation..."
                      value={aiQuery}
                      onChange={(e) => setAiQuery(e.target.value)}
                    />
                    <button
                      type="submit"
                      disabled={!aiQuery.trim()}
                      className="absolute right-3 top-3 bottom-3 w-12 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white flex items-center justify-center disabled:opacity-30 disabled:hover:bg-indigo-600 transition-all active:scale-95 shadow-lg shadow-indigo-900/40"
                    >
                      <Send size={18} />
                    </button>
                  </form>
                </div>
              ) : isAskingAI ? (
                <div className="flex flex-col items-center justify-center py-20 gap-8 animate-pulse">
                  <div className="relative">
                    <Loader2 size={64} className="animate-spin text-indigo-500" />
                    <Zap size={24} className="absolute inset-0 m-auto text-white animate-bounce" />
                  </div>
                  <div className="text-center space-y-2">
                    <p className="text-white font-black text-sm uppercase tracking-widest">Generating Insight</p>
                    <p className="text-indigo-400/50 text-[10px] font-bold uppercase tracking-[0.2em]">
                      Querying active conversation synapses...
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-8 animate-in zoom-in-95 duration-500">
                  <div className="p-6 bg-indigo-950/20 border border-indigo-800/20 rounded-[32px] relative group overflow-hidden">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-600/5 blur-[40px] rounded-full" />
                    <p className="text-indigo-200 text-lg leading-relaxed font-semibold italic relative z-10">
                      "{aiQuery}"
                    </p>
                  </div>
                  <div className="p-8 bg-[#1a1126] border border-indigo-500/10 rounded-[40px] shadow-2xl relative shadow-indigo-900/10">
                    <div className="absolute -top-3 left-8 px-4 py-1.5 bg-indigo-600 rounded-full text-[9px] font-black uppercase tracking-widest text-white shadow-lg">
                      AI Vision
                    </div>
                    <p className="text-gray-200 text-lg leading-relaxed font-medium">{aiResponse}</p>
                    <div className="mt-8 pt-6 border-t border-indigo-900/20 flex gap-3">
                      <button
                        onClick={() => { setAiQuery(""); setAiResponse(""); }}
                        className="flex-1 py-4 px-6 rounded-2xl bg-white/5 hover:bg-white/10 text-gray-400 text-xs font-black uppercase tracking-widest transition flex items-center justify-center gap-2 active:scale-95 group"
                      >
                        <RefreshCw size={14} className="group-hover:rotate-180 transition-transform duration-500" />
                        New Query
                      </button>
                      <button
                        onClick={() => { setIsAskAIOpen(false); setAiQuery(""); setAiResponse(""); }}
                        className="flex-1 py-4 px-6 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-black uppercase tracking-widest transition shadow-lg shadow-indigo-900/30 active:scale-95 flex items-center justify-center gap-2"
                      >
                        <Check size={14} /> Clear
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── AI Copilot Sidebar ── */}
      {isAIPanelOpen && (
        <aside className="w-80 h-full bg-[#0f0a14] border-l border-indigo-900/20 flex flex-col animate-in slide-in-from-right duration-300 shadow-2xl relative z-40">
          <div className="p-6 border-b border-indigo-900/10 flex items-center justify-between bg-[#150f22]">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-900/30">
                <Brain size={18} className="text-white" />
              </div>
              <h2 className="font-black text-xs uppercase tracking-[0.2em] text-white">Copilot Engine</h2>
            </div>
            <button onClick={() => setIsAIPanelOpen(false)} className="text-gray-500 hover:text-white transition">
              <X size={18} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-6 bg-gradient-to-b from-transparent to-indigo-950/10">
            {panelMessages.length === 0 && (
              <div className="h-full flex flex-col items-center justify-center text-center opacity-20 px-4 mt-20">
                <Brain size={48} className="mb-4" />
                <p className="text-[10px] font-black uppercase tracking-[0.3em]">
                  Synaptic Link Established. Ask me anything about your chat context.
                </p>
              </div>
            )}
            {panelMessages.map((m, i) => (
              <div key={i} className={`flex flex-col gap-2 ${m.role === "user" ? "items-end" : "items-start"}`}>
                <div className={`px-4 py-3 rounded-2xl text-[13px] leading-relaxed max-w-[90%] font-medium ${
                  m.role === "user"
                    ? "bg-indigo-600/20 text-indigo-100 border border-indigo-500/10 rounded-tr-none"
                    : "bg-[#1a1126] text-gray-200 border border-indigo-900/20 rounded-tl-none"
                }`}>
                  {m.content}
                </div>
              </div>
            ))}
            {isPanelLoading && (
              <div className="flex gap-2 items-center text-indigo-400/50">
                <Loader2 size={12} className="animate-spin" />
                <span className="text-[9px] font-black uppercase tracking-widest">Generating synapse...</span>
              </div>
            )}
          </div>

          <div className="p-6 bg-[#150f22]/50">
            <form onSubmit={handlePanelQuery} className="relative">
              <input
                type="text"
                value={panelInput}
                onChange={(e) => setPanelInput(e.target.value)}
                className="w-full bg-[#1a1126] border border-indigo-900/30 rounded-2xl px-4 py-3 text-[13px] text-white placeholder-indigo-900/40 outline-none focus:border-indigo-500/50 transition-all font-medium pr-10"
                placeholder="Message AI Assistant..."
              />
              <button
                type="submit"
                disabled={!panelInput.trim() || isPanelLoading}
                className="absolute right-2 top-2 bottom-2 w-8 h-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center active:scale-95 transition disabled:opacity-30"
              >
                <Send size={14} />
              </button>
            </form>
            <p className="text-[9px] text-gray-600 mt-3 text-center uppercase font-bold tracking-widest">
              Context Injection Active
            </p>
          </div>
        </aside>
      )}
    </div>
  );
}
