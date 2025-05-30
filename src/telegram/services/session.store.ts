import { Injectable } from '@nestjs/common';

type SubscriptionState = 
  | 'idle'
  | 'awaiting_symbol' 
  | 'awaiting_interval' 
  | 'awaiting_unsubscribe'
  | 'awaiting_confirmation';

interface SessionData {
  symbol?: string;
  interval?: string;
  action?: 'subscribe' | 'unsubscribe';
  [key: string]: any;
}

@Injectable()
export class SessionStore {
  private sessions: Map<string, { state: SubscriptionState; data: SessionData }> = new Map();

  async setState(userId: string, state: SubscriptionState): Promise<void> {
    const session = this.sessions.get(userId) || { state, data: {} };
    session.state = state;
    this.sessions.set(userId, session);
  }

  async getState(userId: string): Promise<SubscriptionState | null> {
    const session = this.sessions.get(userId);
    return session?.state || null;
  }

  async setData(userId: string, data: SessionData): Promise<void> {
    const session = this.sessions.get(userId) || { state: 'awaiting_symbol', data: {} };
    session.data = { ...session.data, ...data };
    this.sessions.set(userId, session);
  }

  async getData(userId: string): Promise<SessionData | null> {
    const session = this.sessions.get(userId);
    return session?.data || null;
  }

  async clearState(userId: string): Promise<void> {
    this.sessions.delete(userId);
  }
} 