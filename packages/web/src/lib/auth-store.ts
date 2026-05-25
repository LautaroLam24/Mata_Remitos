const STORAGE_KEY = "mr_session";

export interface StoredSession {
  accessToken: string;
  refreshToken: string;
  user: { id: string; email: string; name: string; role: string };
  tenant: { id: string; slug: string; name: string };
}

export const authStore = {
  get(): StoredSession | null {
    if (typeof window === "undefined") return null;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? (JSON.parse(raw) as StoredSession) : null;
    } catch {
      return null;
    }
  },

  set(session: StoredSession): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  },

  clear(): void {
    localStorage.removeItem(STORAGE_KEY);
  },

  getAccessToken(): string | null {
    return this.get()?.accessToken ?? null;
  },
};
