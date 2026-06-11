export interface User {
  id: string;
  displayName: string;
  email: string;
  totalPoints: number;
  createdAt: number;
}

export interface Match {
  id: string;
  homeTeam: string;
  awayTeam: string;
  kickoffTime: number;
  cutoffTime: number;
  hasEgypt: boolean;
  homeScore: number | null;
  awayScore: number | null;
  status: 'pending' | 'completed';
  stage?: string;
  bracketOrder?: number;
  createdAt: number;
}

export interface Prediction {
  id: string;
  matchId: string;
  userId: string;
  homeScore: number;
  awayScore: number;
  points: number;
  status: 'pending' | 'scored';
  createdAt: number;
  updatedAt: number;
}
