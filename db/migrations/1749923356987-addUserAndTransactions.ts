import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUserAndTransactions1749923356987 implements MigrationInterface {
  name = 'AddUserAndTransactions1749923356987';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "users"
       (
           "id"                    character varying          NOT NULL,
           "plan"                  "public"."users_plan_enum" NOT NULL DEFAULT 'free',
           "subscriptionLimit"     integer                    NOT NULL DEFAULT '3',
           "subscriptionExpiresAt" TIMESTAMP WITH TIME ZONE,
           "createdAt"             TIMESTAMP WITH TIME ZONE   NOT NULL DEFAULT now(),
           "updatedAt"             TIMESTAMP WITH TIME ZONE   NOT NULL DEFAULT now(),
           CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id")
       )`,
    );
    await queryRunner.query(
      `CREATE TABLE "transactions"
       (
           "id"                       uuid                              NOT NULL DEFAULT uuid_generate_v4(),
           "userId"                   character varying                 NOT NULL,
           "plan"                     "public"."transactions_plan_enum" NOT NULL,
           "telegramPaymentChargeId"  character varying                 NOT NULL,
           "telegramPaymentInvoiceId" character varying                 NOT NULL,
           "currency"                 character varying                 NOT NULL,
           "amount"                   integer                           NOT NULL,
           "description"              character varying,
           "providerPaymentChargeId"  character varying,
           "shippingOptionId"         character varying,
           "orderInfo"                jsonb,
           "createdAt"                TIMESTAMP WITH TIME ZONE          NOT NULL DEFAULT now(),
           "updatedAt"                TIMESTAMP WITH TIME ZONE          NOT NULL DEFAULT now(),
           CONSTRAINT "PK_a219afd8dd77ed80f5a862f1db9" PRIMARY KEY ("id")
       )`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "transactions"`);
    await queryRunner.query(`DROP TABLE "users"`);
  }
}
