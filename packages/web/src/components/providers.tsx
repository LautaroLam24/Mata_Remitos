"use client";

import React, { createContext, useCallback, useEffect, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { api, type AuthResponse, type LoginBody, type RegisterBody } from "@/lib/api";
import { authStore, type StoredSession } from "@/lib/auth-store";

// ── Auth context ────────────────────────────────────────────────────────────

interface AuthContextValue {
  session: StoredSession | null;
  isLoading: boolean;
  login: (body: LoginBody) => Promise<void>;
  register: (body: RegisterBody) => Promise<void>;
  logout: () => void;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

function applySession(response: AuthResponse): StoredSession {
  const session: StoredSession = {
    accessToken: response.accessToken,
    refreshToken: response.refreshToken,
    user: response.user,
    tenant: response.tenant,
  };
  authStore.set(session);
  return session;
}

function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<StoredSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setSession(authStore.get());
    setIsLoading(false);
  }, []);

  const login = useCallback(async (body: LoginBody) => {
    const response = await api.auth.login(body);
    setSession(applySession(response));
  }, []);

  const register = useCallback(async (body: RegisterBody) => {
    const response = await api.auth.register(body);
    setSession(applySession(response));
  }, []);

  const logout = useCallback(() => {
    authStore.clear();
    setSession(null);
  }, []);

  return (
    <AuthContext.Provider value={{ session, isLoading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

// ── Query client ─────────────────────────────────────────────────────────────

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60 * 1000,
        retry: 1,
      },
    },
  });
}

let browserQueryClient: QueryClient | undefined;

function getQueryClient() {
  if (typeof window === "undefined") return makeQueryClient();
  browserQueryClient ??= makeQueryClient();
  return browserQueryClient;
}

// ── Combined provider ────────────────────────────────────────────────────────

export function Providers({ children }: { children: React.ReactNode }) {
  const queryClient = getQueryClient();

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>{children}</AuthProvider>
    </QueryClientProvider>
  );
}
