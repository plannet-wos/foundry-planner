import { Injectable, inject } from '@angular/core';
import { Firestore, collection, collectionData, doc, setDoc, deleteDoc, getDoc } from '@angular/fire/firestore';
import { Observable } from 'rxjs';
import { Alliance } from '../models/alliance.model';

// Account management (create/read/delete of the `accounts` collection) no
// longer lives here — `accounts` is fully unreadable and its create/update
// are gated by a password-hash proof (see firestore.rules), so it can't be
// managed self-service from this dashboard anymore. Provisioning and
// removing admin accounts is now a manual/elevated step (Firebase console,
// or ask for it). See CLAUDE.md.

@Injectable({ providedIn: 'root' })
export class AllianceService {
  private firestore = inject(Firestore);
  private alliancesCol = collection(this.firestore, 'alliances');

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

  /** Derive a URL-safe slug from a display name */
  static toSlug(name: string): string {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }
}
