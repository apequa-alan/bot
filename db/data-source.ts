import { DataSource, DataSourceOptions } from 'typeorm';
import { Signal } from '../src/signals/entities/signal.entity';
import { Subscription } from '../src/trading-bot/entities/subscription.entity';
import { loadEnvironmentFile } from '../src/config/configuration';

loadEnvironmentFile();

const dataSourceOptions: DataSourceOptions = {
  type: 'postgres',
  url: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
  synchronize: false,
  entities: [Signal, Subscription],
  migrations: ['db/migrations/*.ts'],
};

export default new DataSource(dataSourceOptions);
