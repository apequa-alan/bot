import { DataSource, DataSourceOptions } from 'typeorm';
import { Signal } from '../src/signals/entities/signal.entity';
import { Subscription } from '../src/trading-bot/entities/subscription.entity';
import { User } from '../src/users/entities/user.entity';
import { Transaction } from '../src/users/entities/transaction.entity';
import { loadEnvironmentFile } from '../src/config/configuration';

loadEnvironmentFile();

const dataSourceOptions: DataSourceOptions = {
  type: 'postgres',
  url: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
  synchronize: false,
  entities: [Signal, Subscription, User, Transaction],
  migrations: ['db/migrations/*.ts'],
};

export default new DataSource(dataSourceOptions);
