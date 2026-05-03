import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc, collection, getDocs } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyA_ac19dgbIp3hYNOXmet3J_DgjOWckPes",
  authDomain: "tal-coordinator.firebaseapp.com",
  projectId: "tal-coordinator",
  storageBucket: "tal-coordinator.firebasestorage.app",
  messagingSenderId: "931922842986",
  appId: "1:931922842986:web:6197e8ae336556f64fc113"
};

const players = [
  { id: '493211143', inGameName: 'SugarandSpice',   role: 'main' },
  { id: '488004380', inGameName: 'Xsotic',          role: 'sub'  },
  { id: '490134807', inGameName: 'Sika',            role: 'sub'  },
  { id: '489708422', inGameName: 'FJ62',            role: 'main' },
  { id: '467923588', inGameName: 'ObieOneKanobie',  role: 'main' },
  { id: '488283022', inGameName: 'panda',           role: 'sub'  },
  { id: '481811088', inGameName: '엄준식',           role: 'sub'  },
  { id: '489642286', inGameName: 'GoldenGirl',      role: 'sub'  },
  { id: '443635208', inGameName: 'Mike',            role: 'sub'  },
];

const availability = { time_2: false, time_7: false, time_12: false, time_14: false, time_19: false };

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Insert players
let ok = 0;
for (const p of players) {
  try {
    await setDoc(doc(db, 'players', p.id), {
      id: p.id,
      inGameName: p.inGameName,
      availability,
      role: p.role,
      createdAt: Date.now()
    }, { merge: true });
    console.log(`✓ ${p.inGameName} (${p.id}) → ${p.role}`);
    ok++;
  } catch (e) {
    console.error(`✗ ${p.inGameName}: ${e.message}`);
  }
}
console.log(`\nInserted: ${ok}/${players.length}`);

// Count all roles
const snapshot = await getDocs(collection(db, 'players'));
const all = snapshot.docs.map(d => d.data());
const mains = all.filter(p => p.role === 'main');
const subs  = all.filter(p => p.role === 'sub');
const unassigned = all.filter(p => !p.role || p.role === 'unassigned');

console.log(`\n--- Roster Count ---`);
console.log(`Main:       ${mains.length}`);
console.log(`Sub:        ${subs.length}`);
console.log(`Unassigned: ${unassigned.length}`);
console.log(`Total:      ${all.length}`);
process.exit(0);
