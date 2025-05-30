import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSignalFields1710000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE signals
      ADD COLUMN notified BOOLEAN NOT NULL DEFAULT FALSE,
      ADD COLUMN exit_timestamp TIMESTAMP,
      ADD COLUMN created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      ADD COLUMN updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE signals
      DROP COLUMN notified,
      DROP COLUMN exit_timestamp,
      DROP COLUMN created_at,
      DROP COLUMN updated_at
    `);
  }
} 