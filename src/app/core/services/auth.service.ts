import { Injectable, inject } from '@angular/core';
import { Firestore, doc, setDoc, serverTimestamp } from '@angular/fire/firestore';
import { deriveSaltHex, hashPassword, withLoginTimeout } from '../utils/password.util';

const SESSION_KEY = 'plannet_session';

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

  // Accounts are unreadable by design (see firestore.rules) — there's no
  // backend here to check credentials out-of-band, so "login" is an
  // attempted write that only succeeds if every field, crucially including
  // passwordHash, exactly matches what's already stored (Firestore rules
  // require the write to touch nothing but `lastLoginAt`). Get the password,
  // username, or alliance wrong and the whole write is rejected — that
  // rejection is what "incorrect credentials" means here. This replaces the
  // old hardcoded superadmin check and the plaintext Firestore query alike.
  //
  // `allianceId` selects which path to try: the app can no longer discover
  // it by reading the account, so the caller asserts it via the login
  // page's alliance selector. Leaving it blank means "I'm the superadmin" —
  // only one path is ever attempted, never both, because a rejected write
  // takes much longer to fail than a successful one (see withLoginTimeout);
  // trying both unconditionally would add that whole delay to every normal
  // alliance-admin login.
  async login(username: string, password: string, allianceId?: string): Promise<'superadmin' | 'admin' | null> {
    if (allianceId) {
      if (await this.tryVerifyingWrite(username, password, { allianceId })) {
        this.setSession({ role: 'admin', username, allianceId });
        return 'admin';
      }
      return null;
    }

    if (await this.tryVerifyingWrite(username, password, { role: 'superadmin' })) {
      this.setSession({ role: 'superadmin', username });
      return 'superadmin';
    }
    return null;
  }

  private async tryVerifyingWrite(username: string, password: string, extra: Record<string, unknown>): Promise<boolean> {
    try {
      const passwordHash = await hashPassword(password, await deriveSaltHex(username));
      await withLoginTimeout(setDoc(doc(this.firestore, `accounts/${username}`), {
        id: username,
        username,
        ...extra,
        passwordHash,
        lastLoginAt: serverTimestamp()
      }));
      return true;
    } catch {
      return false;
    }
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
