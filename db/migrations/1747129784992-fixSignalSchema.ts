import { MigrationInterface, QueryRunner } from "typeorm";

export class FixSignalSchema1747129784992 implements MigrationInterface {
    name = 'FixSignalSchema1747129784992'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Drop the existing table
        await queryRunner.query(`DROP TABLE IF EXISTS "signals"`);

        // Create the table with the correct schema
        await queryRunner.query(`
            CREATE TABLE "signals" (
                "id" varchar PRIMARY KEY NOT NULL,
                "symbol" varchar NOT NULL,
                "interval" varchar NOT NULL,
                "type" varchar NOT NULL,
                "entryPrice" decimal(10,2) NOT NULL,
                "takeProfit" decimal(10,2),
                "stopLoss" decimal(10,2),
                "status" varchar NOT NULL DEFAULT 'active',
                "exitPrice" decimal(10,2),
                "profitLoss" float,
                "maxProfit" float NOT NULL DEFAULT 0,
                "notified" boolean NOT NULL DEFAULT false,
                "messageId" integer,
                "validityHours" integer,
                "timestamp" bigint NOT NULL,
                "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
                "closedAt" datetime,
                "updatedAt" datetime NOT NULL DEFAULT (datetime('now'))
            )
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "signals"`);
    }
} 