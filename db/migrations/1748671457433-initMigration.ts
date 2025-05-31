import { MigrationInterface, QueryRunner } from "typeorm";

export class InitMigration1748671457433 implements MigrationInterface {
    name = 'InitMigration1748671457433'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "subscriptions" ("id" varchar PRIMARY KEY NOT NULL, "userId" varchar NOT NULL, "symbol" varchar NOT NULL, "interval" varchar NOT NULL, "takeProfit" decimal(10,2), "active" boolean NOT NULL DEFAULT (1), "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')))`);
        await queryRunner.query(`CREATE TABLE "signals" ("id" varchar PRIMARY KEY NOT NULL, "userId" varchar NOT NULL, "symbol" varchar NOT NULL, "interval" varchar NOT NULL, "type" varchar NOT NULL, "entryPrice" decimal(20,8) NOT NULL, "takeProfit" float NOT NULL, "timestamp" bigint NOT NULL, "status" varchar NOT NULL, "exitPrice" float, "exitTimestamp" datetime, "profitLoss" float, "entryTime" varchar NOT NULL, "active" boolean NOT NULL, "maxProfit" float NOT NULL, "notified" boolean NOT NULL DEFAULT (0), "messageId" integer NOT NULL, "validityHours" integer, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')))`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "signals"`);
        await queryRunner.query(`DROP TABLE "subscriptions"`);
    }

}
