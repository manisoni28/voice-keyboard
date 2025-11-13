import { MigrationInterface, QueryRunner } from "typeorm";

export class InitialSchema1700000000000 implements MigrationInterface {
    name = 'InitialSchema1700000000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Create users table
        await queryRunner.query(`
            CREATE TABLE "users" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "email" character varying NOT NULL,
                "name" character varying NOT NULL,
                "password" character varying NOT NULL,
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "UQ_users_email" UNIQUE ("email"),
                CONSTRAINT "PK_users" PRIMARY KEY ("id")
            )
        `);

        // Create transcriptions table
        await queryRunner.query(`
            CREATE TABLE "transcriptions" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "userId" uuid NOT NULL,
                "text" text NOT NULL,
                "duration" double precision,
                "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "PK_transcriptions" PRIMARY KEY ("id")
            )
        `);

        // Create dictionary table
        await queryRunner.query(`
            CREATE TABLE "dictionary" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "userId" uuid NOT NULL,
                "word" character varying NOT NULL,
                "context" text,
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_dictionary" PRIMARY KEY ("id")
            )
        `);

        // Create indexes for transcriptions
        await queryRunner.query(`
            CREATE INDEX "IDX_transcriptions_user" ON "transcriptions" ("userId")
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_transcriptions_user_created_at" ON "transcriptions" ("userId", "createdAt")
        `);

        // Create indexes for dictionary
        await queryRunner.query(`
            CREATE INDEX "IDX_dictionary_user" ON "dictionary" ("userId")
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_dictionary_user_created_at" ON "dictionary" ("userId", "createdAt")
        `);

        // Add foreign keys
        await queryRunner.query(`
            ALTER TABLE "transcriptions"
            ADD CONSTRAINT "FK_transcriptions_user"
            FOREIGN KEY ("userId") REFERENCES "users"("id")
            ON DELETE CASCADE ON UPDATE NO ACTION
        `);

        await queryRunner.query(`
            ALTER TABLE "dictionary"
            ADD CONSTRAINT "FK_dictionary_user"
            FOREIGN KEY ("userId") REFERENCES "users"("id")
            ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Drop foreign keys
        await queryRunner.query(`
            ALTER TABLE "dictionary" DROP CONSTRAINT "FK_dictionary_user"
        `);
        await queryRunner.query(`
            ALTER TABLE "transcriptions" DROP CONSTRAINT "FK_transcriptions_user"
        `);

        // Drop indexes
        await queryRunner.query(`
            DROP INDEX "IDX_dictionary_user_created_at"
        `);
        await queryRunner.query(`
            DROP INDEX "IDX_dictionary_user"
        `);
        await queryRunner.query(`
            DROP INDEX "IDX_transcriptions_user_created_at"
        `);
        await queryRunner.query(`
            DROP INDEX "IDX_transcriptions_user"
        `);

        // Drop tables
        await queryRunner.query(`DROP TABLE "dictionary"`);
        await queryRunner.query(`DROP TABLE "transcriptions"`);
        await queryRunner.query(`DROP TABLE "users"`);
    }
}