import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, deleteDoc } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyA_ac19dgbIp3hYNOXmet3J_DgjOWckPes",
  authDomain: "tal-coordinator.firebaseapp.com",
  projectId: "tal-coordinator",
  storageBucket: "tal-coordinator.firebasestorage.app",
  messagingSenderId: "931922842986",
  appId: "1:931922842996:web:6197e8ae336556f64fc113"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function clearCollection(name) {
  const snap = await getDocs(collection(db, name));
  await Promise.all(snap.docs.map(d => deleteDoc(d.ref)));
  console.log(`✓ Cleared ${name} (${snap.size} docs)`);
}

await clearCollection('players');
await clearCollection('tasks');
await clearCollection('assignments');
console.log('\nDone.');
process.exit(0);
