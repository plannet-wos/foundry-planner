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
  { inGameName: 'Alex',         id: '486939426' },
  { inGameName: 'Bai Jiu Si',   id: '453530242' },
  { inGameName: 'Blizz',        id: '489347822' },
  { inGameName: 'btimoteo',     id: '478829293' },
  { inGameName: 'CHII',         id: '487037889' },
  { inGameName: 'crotron',      id: '437238140' },
  { inGameName: 'daoud',        id: '490347296' },
  { inGameName: 'Dite',         id: '488233858' },
  { inGameName: 'Dziki',        id: '488905481' },
  { inGameName: 'gravy',        id: '483793568' },
  { inGameName: 'Grissa',       id: '479747302' },
  { inGameName: 'Halluuu',      id: '480648669' },
  { inGameName: 'HANMAN',       id: '492015971' },
  { inGameName: 'JT3C',         id: '484110479' },
  { inGameName: 'Loliance',     id: '455361568' },
  { inGameName: 'Miryamay',     id: '488447163' },
  { inGameName: 'Pat',          id: '486824730' },
  { inGameName: 'Plannet',      id: '490298012' },
  { inGameName: 'Prince',       id: '487726215' },
  { inGameName: 'Princess',     id: '487660965' },
  { inGameName: 'RainTime',     id: '453989042' },
  { inGameName: 'SJ',           id: '482204527' },
  { inGameName: 'SniperK',      id: '489888523' },
  { inGameName: 'Toffee',       id: '472045877' },
  { inGameName: 'Tryitsniperz', id: '492228540' },
  { inGameName: 'Zwant',        id: '488545110' },
];

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const availability = { time_2: false, time_7: false, time_12: false, time_14: false, time_19: false };

let ok = 0;
for (const player of players) {
  try {
    await setDoc(doc(db, 'players', player.id), {
      id: player.id,
      inGameName: player.inGameName,
      availability,
      role: 'unassigned',
      createdAt: Date.now()
    }, { merge: true });
    console.log(`✓ ${player.inGameName} (${player.id})`);
    ok++;
  } catch (e) {
    console.error(`✗ ${player.inGameName}: ${e.message}`);
  }
}

console.log(`\nDone: ${ok}/${players.length} players written.`);
process.exit(0);
