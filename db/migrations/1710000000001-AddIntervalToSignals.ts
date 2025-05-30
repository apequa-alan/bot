import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddIntervalToSignals1710000000001 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE signals
      ADD COLUMN interval varchar NOT NULL DEFAULT '15m'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE signals
      DROP COLUMN interval
    `);
  }
} 