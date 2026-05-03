import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, setDoc } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyA_ac19dgbIp3hYNOXmet3J_DgjOWckPes",
  authDomain: "tal-coordinator.firebaseapp.com",
  projectId: "tal-coordinator",
  storageBucket: "tal-coordinator.firebasestorage.app",
  messagingSenderId: "931922842986",
  appId: "1:931922842986:web:6197e8ae336556f64fc113"
};

const roleList = [
  { name: 'Yozo',             role: 'main' },
  { name: 'Grissa',           role: 'main' },
  { name: 'Blizz',            role: 'main' },
  { name: 'Mad Bunny',        role: 'main' },
  { name: 'Ahad',             role: 'main' },
  { name: 'Obie',             role: 'main' },
  { name: 'SniperK',          role: 'main' },
  { name: 'Miryamay',         role: 'main' },
  { name: 'Dziki',            role: 'main' },
  { name: 'JT3C',             role: 'main' },
  { name: 'btimoteo',         role: 'main' },
  { name: 'Harley',           role: 'main' },
  { name: 'SJ',               role: 'main' },
  { name: 'Dite',             role: 'main' },
  { name: 'SugarandSpice',    role: 'main' },
  { name: 'FJ62',             role: 'main' },
  { name: 'Prince',           role: 'main' },
  { name: 'Plannet',          role: 'main' },
  { name: 'daoud',            role: 'main' },
  { name: 'Tryitsniperz',     role: 'main' },
  { name: 'Alex',             role: 'main' },
  { name: 'Toffee',           role: 'main' },
  { name: 'Coba',             role: 'main' },
  { name: 'Zwant',            role: 'main' },
  { name: 'Shelldon',         role: 'sub' },
  { name: 'ronald weasley',   role: 'main' },
  { name: 'LyClover',         role: 'sub' },
  { name: 'SugarDaddyMel',    role: 'main' },
  { name: 'Pat',              role: 'main' },
  { name: '3ThirtyFoxhound',  role: 'main' },
  { name: 'Brennan',          role: 'main' },
  { name: 'Arsal',            role: 'sub' },
  { name: 'RainTime',         role: 'sub' },
  { name: 'panda',            role: 'sub' },
  { name: 'crotron',          role: 'sub' },
  { name: 'Diego',            role: 'sub' },
  { name: 'gravy',            role: 'main' },
  { name: 'Mike',             role: 'sub' },
  { name: 'Halluuu',          role: 'sub' },
  { name: 'Xsotic',           role: 'sub' },
  { name: 'Sika',             role: 'sub' },
  { name: 'HANMAN',           role: 'sub' },
  { name: 'Osama',            role: 'sub' },
  { name: 'Loliance',         role: 'sub' },
  { name: 'Bai Jiu Si',       role: 'sub' },
  { name: '엄준식',            role: 'sub' },
  { name: 'CHII',             role: 'sub' },
  { name: 'MR Achi',          role: 'sub' },
  { name: 'Princess',         role: 'sub' },
  { name: 'ObieWhiskey',      role: 'sub' },
];

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Fetch all current players
const snapshot = await getDocs(collection(db, 'players'));
const players = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));

// Match case-insensitively
const byName = new Map(players.map(p => [p.inGameName.toLowerCase(), p]));

let updated = 0, notFound = [];

for (const entry of roleList) {
  const player = byName.get(entry.name.toLowerCase());
  if (!player) {
    notFound.push(entry.name);
    continue;
  }
  await setDoc(doc(db, 'players', player.id), { role: entry.role }, { merge: true });
  console.log(`✓ ${player.inGameName} (${player.id}) → ${entry.role}`);
  updated++;
}

console.log(`\nUpdated: ${updated}/${roleList.length}`);
if (notFound.length) {
  console.log(`\nNot found in database (${notFound.length}):`);
  notFound.forEach(n => console.log(`  ✗ ${n}`));
}
process.exit(0);
