import { init } from '@sentry/nestjs';
import { loadEnvironmentFile } from './config/configuration';

loadEnvironmentFile();

init({
  dsn: process.env.SENTRY_DSN,
  sendDefaultPii: true,
});
