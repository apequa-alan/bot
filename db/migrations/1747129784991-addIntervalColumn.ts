import { MigrationInterface, QueryRunner } from "typeorm";

export class AddIntervalColumn1747129784991 implements MigrationInterface {
    name = 'AddIntervalColumn1747129784991'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "signals" ADD COLUMN "interval" varchar NOT NULL DEFAULT '1m'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "signals" DROP COLUMN "interval"`);
    }
} 