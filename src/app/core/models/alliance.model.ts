export interface Alliance {
  id: string;        // URL-safe slug — used as Firestore doc ID and route param
  name: string;
  finalTime?: string;  // legacy — superseded by per-legion times below
  finalTimeL1?: string;
  finalTimeL2?: string;
  createdAt: number;
}

export interface Account {
  id: string;        // username used as doc ID (ensures uniqueness)
  username: string;
  password: string;
  allianceId: string;
}
