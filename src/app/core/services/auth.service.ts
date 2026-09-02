import { Injectable, inject, signal, computed } from '@angular/core';
import { Auth } from '@angular/fire/auth';
import { Firestore, doc, onSnapshot } from '@angular/fire/firestore';
import {
  User,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  getMultiFactorResolver,
  MultiFactorResolver,
  MultiFactorError,
  TotpMultiFactorGenerator,
} from 'firebase/auth';
import { Account } from '../models/account.model';
import { Rank } from '../constants/roles';

/**
 * Mirrors plannet-wos's auth.service.ts (that's where signup/TOTP-enrollment live now —
 * this app only ever needs to log an already-provisioned account in). Accounts are shared
 * across the whole suite via the `accounts` collection, so a superadmin/state_admin/R5/R4
 * created anywhere works here with the same credentials — see the multi-state rollout plan.
 */
export class MfaRequiredError extends Error {
  constructor(public resolver: MultiFactorResolver) {
    super('mfa-required');
  }
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private auth = inject(Auth);
  private firestore = inject(Firestore);

  private readonly _user = signal<User | null>(null);
  private readonly _account = signal<Account | null>(null);
  private unsubAccount: (() => void) | null = null;

  readonly user = this._user.asReadonly();
  readonly account = this._account.asReadonly();
  readonly isAuthenticated = computed(() => this._user() !== null);
  readonly isActive = computed(() => this._account()?.status === 'active');
  readonly rank = computed<Rank | null>(() => this._account()?.rank ?? null);

  constructor() {
    onAuthStateChanged(this.auth, (user) => {
      this._user.set(user);
      this.unsubAccount?.();
      this.unsubAccount = null;
      this._account.set(null);
      if (user) {
        this.unsubAccount = onSnapshot(doc(this.firestore, `accounts/${user.uid}`), (snap) => {
          this._account.set(snap.exists() ? (snap.data() as Account) : null);
        });
      }
    });
  }

  /** Throws MfaRequiredError if the account has TOTP enrolled — catch it and call completeMfaSignIn() with the user's code. */
  async login(email: string, password: string): Promise<User> {
    try {
      const cred = await signInWithEmailAndPassword(this.auth, email, password);
      return cred.user;
    } catch (err) {
      if ((err as MultiFactorError)?.code === 'auth/multi-factor-auth-required') {
        throw new MfaRequiredError(getMultiFactorResolver(this.auth, err as MultiFactorError));
      }
      throw err;
    }
  }

  async completeMfaSignIn(resolver: MultiFactorResolver, otp: string): Promise<User> {
    const hint = resolver.hints.find((h) => h.factorId === TotpMultiFactorGenerator.FACTOR_ID);
    if (!hint) throw new Error('No TOTP factor enrolled on this account');
    const assertion = TotpMultiFactorGenerator.assertionForSignIn(hint.uid, otp);
    const cred = await resolver.resolveSignIn(assertion);
    return cred.user;
  }

  logout(): void {
    signOut(this.auth);
  }
}
