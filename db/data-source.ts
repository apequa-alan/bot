import { DataSource, DataSourceOptions } from 'typeorm';

export const dataSourceOptions: DataSourceOptions = {
    type: 'sqlite',
    database: 'signals.db',
    synchronize: false,
    entities: ['src/**/*.entity.ts'],
    migrations: ['db/migrations/*.ts']
};

export default new DataSource(dataSourceOptions);