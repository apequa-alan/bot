import { MigrationInterface, QueryRunner } from "typeorm";

export class InitMigration1747129784990 implements MigrationInterface {
    name = 'InitMigration1747129784990'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "signals" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "symbol" varchar NOT NULL, "type" varchar NOT NULL, "entryPrice" float NOT NULL, "takeProfit" float NOT NULL, "timestamp" bigint NOT NULL, "status" varchar NOT NULL, "exitPrice" float, "exitTimestamp" bigint, "profitLoss" float, "entryTime" varchar NOT NULL, "active" boolean NOT NULL, "maxProfit" float NOT NULL, "notified" boolean NOT NULL, "messageId" integer NOT NULL, "validityHours" integer)`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "signals"`);
    }

}
