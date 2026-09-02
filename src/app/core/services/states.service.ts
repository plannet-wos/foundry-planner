import { Injectable, inject } from '@angular/core';
import { Firestore, collection, collectionData } from '@angular/fire/firestore';
import { Observable } from 'rxjs';
import { StateDoc } from '../models/account.model';

/**
 * Read-only mirror of plannet-wos's states.service.ts — this app only ever needs to list
 * states for the "Create State Event" state picker (see superadmin.ts), never create one.
 */
@Injectable({ providedIn: 'root' })
export class StatesService {
  private firestore = inject(Firestore);

  list$(): Observable<StateDoc[]> {
    return collectionData(collection(this.firestore, 'states')) as Observable<StateDoc[]>;
  }
}
