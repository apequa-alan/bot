import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitMigration1748874269853 implements MigrationInterface {
  name = 'InitMigration1748874269853';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "subscriptions" ("id" varchar PRIMARY KEY NOT NULL, "userId" varchar NOT NULL, "symbol" varchar NOT NULL, "interval" varchar NOT NULL, "takeProfit" decimal(10,2), "active" boolean NOT NULL DEFAULT (1), "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')))`,
    );
    await queryRunner.query(
      `CREATE TABLE "signals" ("id" varchar PRIMARY KEY NOT NULL, "userId" varchar NOT NULL, "symbol" varchar NOT NULL, "interval" varchar NOT NULL, "type" varchar NOT NULL, "entryPrice" decimal(20,8) NOT NULL, "takeProfit" float NOT NULL, "status" varchar NOT NULL, "messageId" integer NOT NULL, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "signals"`);
    await queryRunner.query(`DROP TABLE "subscriptions"`);
  }
}
