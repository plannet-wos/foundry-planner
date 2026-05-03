import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyA_ac19dgbIp3hYNOXmet3J_DgjOWckPes",
  authDomain: "tal-coordinator.firebaseapp.com",
  projectId: "tal-coordinator",
  storageBucket: "tal-coordinator.firebasestorage.app",
  messagingSenderId: "931922842986",
  appId: "1:931922842986:web:6197e8ae336556f64fc113"
};

const players = [
  { id: '482422724', inGameName: 'Yozo',            role: 'main' },
  { id: '490577522', inGameName: 'Ahad',            role: 'main' },
  { id: '455676345', inGameName: 'LyClover',        role: 'sub'  },
  { id: '484054810', inGameName: 'Shelldon',        role: 'sub'  },
  { id: '493064160', inGameName: 'Brennan',         role: 'main' },
  { id: '485512977', inGameName: 'Coba',            role: 'main' },
  { id: '487628141', inGameName: 'SugarDaddyMel',   role: 'main' },
  { id: '490085311', inGameName: 'Yamato',          role: 'main' },
  { id: '487431612', inGameName: 'ronald weasley',  role: 'main' },
  { id: '486119270', inGameName: '3ThirtyFoxhound', role: 'main' },
  { id: '478174660', inGameName: 'Arsal',           role: 'sub'  },
  { id: '485645008', inGameName: 'Diego',           role: 'sub'  },
  { id: '479648576', inGameName: 'Osama',           role: 'sub'  },
];

const availability = { time_2: false, time_7: false, time_12: false, time_14: false, time_19: false };

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

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

console.log(`\nDone: ${ok}/${players.length} players added.`);
process.exit(0);
