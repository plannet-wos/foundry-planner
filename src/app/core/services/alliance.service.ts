import { Injectable, inject } from '@angular/core';
import { Firestore, collection, collectionData, doc, setDoc, deleteDoc, getDoc, getDocs, query, where } from '@angular/fire/firestore';
import { Observable } from 'rxjs';
import { Alliance, Account } from '../models/alliance.model';

@Injectable({ providedIn: 'root' })
export class AllianceService {
  private firestore = inject(Firestore);
  private alliancesCol = collection(this.firestore, 'alliances');
  private accountsCol  = collection(this.firestore, 'accounts');

  getAlliances(): Observable<Alliance[]> {
    return collectionData(this.alliancesCol, { idField: 'id' }) as Observable<Alliance[]>;
  }

  async getAlliance(allianceId: string): Promise<Alliance | null> {
    const snap = await getDoc(doc(this.firestore, `alliances/${allianceId}`));
    return snap.exists() ? (snap.data() as Alliance) : null;
  }

  async saveAlliance(alliance: Alliance): Promise<void> {
    await setDoc(doc(this.firestore, `alliances/${alliance.id}`), alliance, { merge: true });
  }

  async updateAlliance(allianceId: string, updates: Partial<Omit<Alliance, 'id'>>): Promise<void> {
    await setDoc(doc(this.firestore, `alliances/${allianceId}`), updates, { merge: true });
  }

  async deleteAlliance(allianceId: string): Promise<void> {
    await deleteDoc(doc(this.firestore, `alliances/${allianceId}`));
  }

  // Accounts
  getAccountsByAlliance(allianceId: string): Observable<Account[]> {
    return collectionData(
      query(this.accountsCol, where('allianceId', '==', allianceId)),
      { idField: 'id' }
    ) as Observable<Account[]>;
  }

  async saveAccount(account: Account): Promise<void> {
    await setDoc(doc(this.firestore, `accounts/${account.id}`), account, { merge: true });
  }

  async deleteAccountsByAlliance(allianceId: string): Promise<void> {
    const snap = await getDocs(query(this.accountsCol, where('allianceId', '==', allianceId)));
    await Promise.all(snap.docs.map(d => deleteDoc(d.ref)));
  }

  /** Derive a URL-safe slug from a display name */
  static toSlug(name: string): string {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }
}
