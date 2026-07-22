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

  /** Fetch all players from alliances other than the specified one */
  async getPlayersFromOtherAlliances(excludeAllianceId: string): Promise<Player[]> {
    const playersCol = collection(this.firestore, 'players');
    const q = query(playersCol, where('allianceId', '!=', excludeAllianceId));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ ...d.data(), id: d.id } as Player));
  }
}
