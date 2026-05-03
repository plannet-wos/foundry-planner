import { Injectable, inject } from '@angular/core';
import { Firestore, collection, doc, setDoc, deleteDoc, deleteField, collectionData, query, where } from '@angular/fire/firestore';
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

  /** Set or clear the player's spending tier. Pass `null` to remove the field. */
  async updatePlayerTier(playerId: string, tier: PlayerTier | null): Promise<void> {
    const value = tier === null ? deleteField() : tier;
    await setDoc(doc(this.firestore, `players/${playerId}`), { tier: value }, { merge: true });
  }

  async deletePlayer(playerId: string): Promise<void> {
    await deleteDoc(doc(this.firestore, `players/${playerId}`));
  }
}
