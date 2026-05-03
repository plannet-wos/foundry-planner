import { Injectable, inject } from '@angular/core';
import { Firestore, collection, collectionData, doc, setDoc, deleteDoc } from '@angular/fire/firestore';
import { Observable } from 'rxjs';
import { Feedback } from '../models/feedback.model';

@Injectable({ providedIn: 'root' })
export class FeedbackService {
  private firestore = inject(Firestore);
  private col       = collection(this.firestore, 'feedback');

  async submit(entry: Omit<Feedback, 'id'>): Promise<void> {
    const id = `fb_${Date.now()}`;
    await setDoc(doc(this.firestore, `feedback/${id}`), { id, ...entry });
  }

  getAll(): Observable<Feedback[]> {
    return collectionData(this.col, { idField: 'id' }) as Observable<Feedback[]>;
  }

  async delete(id: string): Promise<void> {
    await deleteDoc(doc(this.firestore, `feedback/${id}`));
  }
}
