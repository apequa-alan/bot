import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitMigration1748931714354 implements MigrationInterface {
  name = 'InitMigration1748931714354';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE "subscriptions"
                             (
                                 "id"         uuid              NOT NULL DEFAULT uuid_generate_v4(),
                                 "userId"     character varying NOT NULL,
                                 "symbol"     character varying NOT NULL,
                                 "interval"   character varying NOT NULL,
                                 "takeProfit" numeric(10, 2),
                                 "active"     boolean           NOT NULL DEFAULT true,
                                 "createdAt"  TIMESTAMP         NOT NULL DEFAULT now(),
                                 "updatedAt"  TIMESTAMP         NOT NULL DEFAULT now(),
                                 CONSTRAINT "PK_a87248d73155605cf782be9ee5e" PRIMARY KEY ("id")
                             )`);
    await queryRunner.query(`CREATE TABLE "signals"
                             (
                                 "id"         uuid              NOT NULL DEFAULT uuid_generate_v4(),
                                 "userId"     character varying NOT NULL,
                                 "symbol"     character varying NOT NULL,
                                 "interval"   character varying NOT NULL,
                                 "type"       character varying NOT NULL,
                                 "entryPrice" numeric(20, 8)    NOT NULL,
                                 "takeProfit" double precision  NOT NULL,
                                 "status"     character varying NOT NULL,
                                 "messageId"  integer           NOT NULL,
                                 "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                                 "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                                 CONSTRAINT "PK_04eeac09c09b65bc55c628c101d" PRIMARY KEY ("id")
                             )`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "signals"`);
    await queryRunner.query(`DROP TABLE "subscriptions"`);
  }
}
