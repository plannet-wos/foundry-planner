import { Injectable, inject } from '@angular/core';
import { Firestore, collection, collectionData, doc, getDoc, setDoc, query, where } from '@angular/fire/firestore';
import { Observable } from 'rxjs';
import { Alliance } from '../models/alliance.model';

// Alliance CRUD (create/rename/delete) moved to plannet-wos's state-admin dashboard as part
// of the multi-state rollout — see that repo's core/services/alliance.service.ts and the
// rollout plan. superadmin.ts keeps a read-only list purely for jumping into a given
// alliance's dashboard. updateAlliance() stays here though: setting battle times and the
// cross-alliance flag is day-to-day admin-dashboard work for that alliance's own R4/R5, not
// a state_admin-level structural change — firestore.rules allows it as a narrow exception
// (only those specific fields) on top of the state_admin-only rule for everything else.
@Injectable({ providedIn: 'root' })
export class AllianceService {
  private firestore = inject(Firestore);

  getAlliances(): Observable<Alliance[]> {
    return collectionData(collection(this.firestore, 'alliances')) as Observable<Alliance[]>;
  }

  listForState$(stateId: string): Observable<Alliance[]> {
    const q = query(collection(this.firestore, 'alliances'), where('stateId', '==', stateId));
    return collectionData(q) as Observable<Alliance[]>;
  }

  /** `id` is the full composite ("{stateId}-{slug}") — see allianceId() and how every call site builds it from the route. */
  async getAlliance(id: string): Promise<Alliance | null> {
    const snap = await getDoc(doc(this.firestore, `alliances/${id}`));
    return snap.exists() ? (snap.data() as Alliance) : null;
  }

  async updateAlliance(id: string, updates: Partial<Pick<Alliance, 'finalTime' | 'finalTimeL1' | 'finalTimeL2' | 'isCrossAlliance'>>): Promise<void> {
    await setDoc(doc(this.firestore, `alliances/${id}`), updates, { merge: true });
  }
}
