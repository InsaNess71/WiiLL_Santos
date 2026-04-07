export interface Confession {
  id: string;
  text: string;
  category: string;
  age?: number;
  gender?: string;
  likes: number;
  commentCount: number;
  createdAt: any; // Firestore Timestamp
  authorId: string;
}

export interface Comment {
  id: string;
  confessionId: string;
  text: string;
  createdAt: any; // Firestore Timestamp
  authorId: string;
}

export interface UserProfile {
  id: string;
  nickname: string;
  createdAt: any;
  lastActive?: any;
  gender?: string;
  maritalStatus?: string;
  bio?: string;
}

export interface Chat {
  id: string;
  participants: string[];
  expiresAt: any;
  durationMode: '1h' | '24h';
  updatedAt: any;
  unreadCount?: Record<string, number>;
  lastMessage?: string;
}

export interface ChatMessage {
  id: string;
  senderId: string;
  text: string;
  createdAt: any;
  isSystem: boolean;
}

export const CATEGORIES = [
  'Relacionamentos',
  'Segredos',
  'Família',
  'Sexo',
  'Vida',
  'Arrependimentos'
];
