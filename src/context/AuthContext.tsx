"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import { useRouter } from "next/navigation";

interface User {
  phoneNumber: string;
  username: string;
  isVerified: boolean;
}

interface AuthContextType {
  user: User | null;
  login: (phoneNumber: string, username: string, isVerified?: boolean) => void;
  logout: () => void;
  refreshUser: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isReady, setIsReady] = useState(false);
  const router = useRouter();

  const refreshUser = () => {
    const storedUser = localStorage.getItem("chat_user");
    if (storedUser) setUser(JSON.parse(storedUser));
  };

  useEffect(() => {
    refreshUser();
    setIsReady(true);
  }, []);

  const login = (phoneNumber: string, username: string, isVerified = false) => {
    const newUser = { phoneNumber, username, isVerified };
    setUser(newUser);
    localStorage.setItem("chat_user", JSON.stringify(newUser));
    router.push("/");
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem("chat_user");
    router.push("/login");
  };

  if (!isReady) {
    return null; // Or a loading spinner
  }

  return (
    <AuthContext.Provider value={{ user, login, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
