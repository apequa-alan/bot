import { MigrationInterface, QueryRunner } from "typeorm";

export class UpdateSignalsTable1747129784991 implements MigrationInterface {
    name = 'UpdateSignalsTable1747129784991'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Add new columns
        await queryRunner.query(`ALTER TABLE "signals" ADD COLUMN "createdAt" datetime NOT NULL DEFAULT (datetime('now'))`);
        await queryRunner.query(`ALTER TABLE "signals" ADD COLUMN "updatedAt" datetime NOT NULL DEFAULT (datetime('now'))`);
        await queryRunner.query(`ALTER TABLE "signals" ADD COLUMN "closedAt" datetime`);
        await queryRunner.query(`ALTER TABLE "signals" ADD COLUMN "stopLoss" float`);

        // Migrate data
        await queryRunner.query(`
            UPDATE "signals"
            SET "createdAt" = datetime("timestamp" / 1000, 'unixepoch'),
                "updatedAt" = datetime("timestamp" / 1000, 'unixepoch'),
                "closedAt" = CASE 
                    WHEN "exitTimestamp" IS NOT NULL 
                    THEN datetime("exitTimestamp" / 1000, 'unixepoch')
                    ELSE NULL
                END
        `);

        // Drop old columns
        await queryRunner.query(`ALTER TABLE "signals" DROP COLUMN "entryTime"`);
        await queryRunner.query(`ALTER TABLE "signals" DROP COLUMN "exitTimestamp"`);
        await queryRunner.query(`ALTER TABLE "signals" DROP COLUMN "active"`);
        await queryRunner.query(`ALTER TABLE "signals" DROP COLUMN "profit"`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Add back old columns
        await queryRunner.query(`ALTER TABLE "signals" ADD COLUMN "entryTime" varchar NOT NULL DEFAULT ''`);
        await queryRunner.query(`ALTER TABLE "signals" ADD COLUMN "exitTimestamp" bigint`);
        await queryRunner.query(`ALTER TABLE "signals" ADD COLUMN "active" boolean NOT NULL DEFAULT 1`);
        await queryRunner.query(`ALTER TABLE "signals" ADD COLUMN "profit" float`);

        // Migrate data back
        await queryRunner.query(`
            UPDATE "signals"
            SET "entryTime" = strftime('%Y-%m-%d %H:%M:%S', "createdAt"),
                "exitTimestamp" = CASE 
                    WHEN "closedAt" IS NOT NULL 
                    THEN strftime('%s', "closedAt") * 1000
                    ELSE NULL
                END,
                "active" = CASE WHEN "status" = 'active' THEN 1 ELSE 0 END,
                "profit" = "profitLoss"
        `);

        // Drop new columns
        await queryRunner.query(`ALTER TABLE "signals" DROP COLUMN "createdAt"`);
        await queryRunner.query(`ALTER TABLE "signals" DROP COLUMN "updatedAt"`);
        await queryRunner.query(`ALTER TABLE "signals" DROP COLUMN "closedAt"`);
        await queryRunner.query(`ALTER TABLE "signals" DROP COLUMN "stopLoss"`);
    }
} 