import { init } from '@sentry/nestjs';
import { config } from 'dotenv';

config();

init({
  dsn: process.env.SENTRY_DSN,
  sendDefaultPii: true,
});
