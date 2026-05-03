export interface Feedback {
  id: string;
  type: 'bug' | 'suggestion' | 'general';
  message: string;
  page: string;
  createdAt: number;
}
