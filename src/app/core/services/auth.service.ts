import { Injectable, inject } from '@angular/core';
import { Firestore, collection, query, where, getDocs } from '@angular/fire/firestore';

const SESSION_KEY = 'plannet_session';
const SUPERADMIN_USERNAME = 'superadmin';
const SUPERADMIN_PASSWORD = '3038';

export interface AdminSession {
  role: 'superadmin' | 'admin';
  allianceId?: string;
  username: string;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private firestore = inject(Firestore);

  constructor() {
    this.ingestToken();
  }

  private ingestToken(): void {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    if (!token) return;
    try {
      const session = JSON.parse(atob(token)) as AdminSession;
      if (session.role && session.username) {
        this.setSession(session);
        // Clean the URL
        const url = new URL(window.location.href);
        url.searchParams.delete('token');
        window.history.replaceState({}, '', url.toString());
      }
    } catch { /* ignore invalid tokens */ }
  }

  async login(username: string, password: string): Promise<'superadmin' | 'admin' | null> {
    // Superadmin — hardcoded
    if (username === SUPERADMIN_USERNAME && password === SUPERADMIN_PASSWORD) {
      this.setSession({ role: 'superadmin', username });
      return 'superadmin';
    }

    // Alliance admin — stored in Firestore
    const q = query(
      collection(this.firestore, 'accounts'),
      where('username', '==', username),
      where('password', '==', password)
    );
    const snap = await getDocs(q);
    if (!snap.empty) {
      const data = snap.docs[0].data();
      this.setSession({ role: 'admin', username, allianceId: data['allianceId'] });
      return 'admin';
    }

    return null;
  }

  private setSession(session: AdminSession): void {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  }

  getSession(): AdminSession | null {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    try { return JSON.parse(raw) as AdminSession; } catch { return null; }
  }

  isAuthenticated(): boolean {
    return this.getSession() !== null;
  }

  isSuperAdmin(): boolean {
    return this.getSession()?.role === 'superadmin';
  }

  getAllianceId(): string | null {
    return this.getSession()?.allianceId ?? null;
  }

  logout(): void {
    sessionStorage.removeItem(SESSION_KEY);
  }
}
