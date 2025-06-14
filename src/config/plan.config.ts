export type UserPlan = 'free' | 'pro' | 'premium';

interface PlanConfig {
  limit: number;
  priceStars: number;
  durationDays: number;
}

export const PLAN_CONFIG: Record<UserPlan, PlanConfig> = {
  free: {
    limit: 3,
    priceStars: 0,
    durationDays: Infinity,
  },
  pro: {
    limit: 30,
    priceStars: 5,
    durationDays: 30,
  },
  premium: {
    limit: 300,
    priceStars: 10,
    durationDays: 30,
  },
} as const;
