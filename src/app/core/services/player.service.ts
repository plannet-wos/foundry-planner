import { Injectable, inject } from '@angular/core';
import { Firestore, collection, doc, setDoc, deleteDoc, deleteField, collectionData, query, where, getDocs, getDoc } from '@angular/fire/firestore';
import { Observable } from 'rxjs';
import { Player, PlayerTier } from '../models/player.model';

@Injectable({ providedIn: 'root' })
export class PlayerService {
  private firestore = inject(Firestore);
  private playersCollection = collection(this.firestore, 'players');

  async savePlayer(player: Player): Promise<void> {
    const playerDoc = doc(this.firestore, `players/${player.id}`);
    await setDoc(playerDoc, {
      ...player,
      createdAt: player.createdAt || Date.now()
    }, { merge: true });
  }

  getPlayersByAlliance(allianceId: string): Observable<Player[]> {
    return collectionData(
      query(this.playersCollection, where('allianceId', '==', allianceId)),
      { idField: 'id' }
    ) as Observable<Player[]>;
  }

  async updatePlayerLegion(playerId: string, legion: 1 | 2 | 'unassigned'): Promise<void> {
    await setDoc(doc(this.firestore, `players/${playerId}`), { legion }, { merge: true });
  }

  /** Update a player's league for a specific alliance (for cross-alliance events) */
  async updatePlayerLegionInAlliance(playerId: string, allianceId: string, legion: 1 | 2 | 'unassigned'): Promise<void> {
    await setDoc(doc(this.firestore, `players/${playerId}`), {
      legionByAlliance: { [allianceId]: legion }
    }, { merge: true });
  }

  /** Set or clear the player's spending tier. Pass `null` to remove the field. */
  async updatePlayerTier(playerId: string, tier: PlayerTier | null): Promise<void> {
    const value = tier === null ? deleteField() : tier;
    await setDoc(doc(this.firestore, `players/${playerId}`), { tier: value }, { merge: true });
  }

  /** Set or clear the player's spending tier for a specific alliance (for cross-alliance events) */
  async updatePlayerTierInAlliance(playerId: string, allianceId: string, tier: PlayerTier | null): Promise<void> {
    const playerRef = doc(this.firestore, `players/${playerId}`);
    const playerSnap = await getDoc(playerRef);
    const existingTiersByAlliance = playerSnap.data()?.['tierByAlliance'] || {};

    const updatedTiers = { ...existingTiersByAlliance };
    if (tier === null) {
      delete updatedTiers[allianceId];
    } else {
      updatedTiers[allianceId] = tier;
    }

    // Only set tierByAlliance if there are any tiers left
    const updateObj: any = Object.keys(updatedTiers).length > 0
      ? { tierByAlliance: updatedTiers }
      : { tierByAlliance: deleteField() };

    await setDoc(playerRef, updateObj, { merge: true });
  }

  async deletePlayer(playerId: string): Promise<void> {
    await deleteDoc(doc(this.firestore, `players/${playerId}`));
  }

  /**
   * Every player belonging to a "real" alliance (type !== 'state_event') in the given state —
   * the roster for a state-event alliance's admin-dashboard/battle-plan-builder/signup views
   * and, critically, for a participant looking up their own plan there (see personal-plan.ts/
   * global-plan.ts). Scoped to one state by construction — replaces the old
   * getPlayersFromOtherAlliances(), whose unscoped `allianceId != mine` query pulled in every
   * player from every state once more than one existed. `excludeAllianceId` is normally the
   * state-event shell itself; it's excluded from the alliance list even though it's already
   * filtered out by type, in case a caller passes something else.
   */
  async getPlayersForStateEvent(stateId: string, excludeAllianceId: string): Promise<Player[]> {
    const alliancesCol = collection(this.firestore, 'alliances');
    const allianceSnap = await getDocs(query(alliancesCol, where('stateId', '==', stateId)));
    const realAllianceIds = allianceSnap.docs
      .filter((d) => d.id !== excludeAllianceId && d.data()['type'] !== 'state_event')
      .map((d) => d.id);

    if (realAllianceIds.length === 0) return [];

    // Firestore's `in` operator caps at 30 values — chunk defensively in case a state ever
    // has more alliances than that.
    const chunks: string[][] = [];
    for (let i = 0; i < realAllianceIds.length; i += 30) chunks.push(realAllianceIds.slice(i, i + 30));

    const results = await Promise.all(
      chunks.map((ids) => getDocs(query(this.playersCollection, where('allianceId', 'in', ids)))),
    );
    return results.flatMap((snap) => snap.docs.map((d) => ({ ...d.data(), id: d.id } as Player)));
  }
}
