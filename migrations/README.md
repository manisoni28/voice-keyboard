# Database Migrations

This directory contains TypeORM migrations for managing database schema changes.

## What are Migrations?

Migrations are version control for your database schema. They allow you to:
- Track database changes over time
- Apply schema changes consistently across environments
- Roll back changes if needed
- Collaborate with team members safely

## Available Migrations

### 1700000000000-InitialSchema.ts

Creates the initial database schema including:
- **users** table with email authentication
- **transcriptions** table for voice transcription records
- **dictionary** table for custom word/context entries
- All necessary indexes and foreign key constraints

## Using Migrations

### Show Migration Status

See which migrations have been run and which are pending:

```bash
npm run migration:show
```

### Run Pending Migrations

Apply all pending migrations to your database:

```bash
npm run migration:run
```

This is safe to run multiple times - it only applies migrations that haven't been run yet.

### Revert Last Migration

Undo the most recently applied migration:

```bash
npm run migration:revert
```

⚠️ **Warning**: This will delete data if the migration created tables with data in them.

## Creating New Migrations

### Auto-generate from Entity Changes

When you modify entity files (in `/entities`), TypeORM can automatically generate a migration:

```bash
npm run migration:generate migrations/YourMigrationName
```

For example:
```bash
npm run migration:generate migrations/AddUserPhoneNumber
```

This will:
1. Compare your entities with the current database schema
2. Generate SQL to sync the database with your entities
3. Create a timestamped migration file

### Create Empty Migration

To write custom SQL, create an empty migration:

```bash
npm run migration:create migrations/YourMigrationName
```

Then edit the generated file to add your SQL commands.

## Migration Workflow

### Local Development

1. Make changes to your entity files
2. Generate a migration:
   ```bash
   npm run migration:generate migrations/DescriptiveNameHere
   ```
3. Review the generated SQL in the migration file
4. Test the migration locally:
   ```bash
   npm run migration:run
   ```
5. If issues occur, revert and fix:
   ```bash
   npm run migration:revert
   ```
6. Once satisfied, commit the migration file to git

### Deploying to Production

1. Deploy your code with the new migration file
2. Run migrations using Railway CLI:
   ```bash
   railway run npm run migration:run
   ```

Or use Railway's one-off commands in the dashboard.

## Migration Best Practices

### DO:
- ✅ Review generated migrations before running them
- ✅ Test migrations on a copy of production data
- ✅ Make small, incremental changes
- ✅ Use descriptive migration names
- ✅ Commit migration files to version control
- ✅ Include both `up()` and `down()` methods

### DON'T:
- ❌ Modify existing migration files after they've been run
- ❌ Delete migration files (creates inconsistency)
- ❌ Mix schema and data changes in one migration
- ❌ Run migrations manually in production (use CLI)
- ❌ Skip testing migrations locally first

## Troubleshooting

### "No migrations found"

- Check that migration files exist in `/migrations`
- Ensure files follow the naming pattern: `[timestamp]-[Name].ts`
- Verify `typeorm.config.ts` points to the correct path

### "Migration has already been executed"

This is expected behavior. Migrations track which have been run using a `migrations` table in your database.

### "QueryFailedError"

- Review the SQL in your migration file
- Check for syntax errors or invalid table/column names
- Test against a local database first

### TypeORM can't find entities

Make sure:
- `reflect-metadata` is imported in your data source
- Entity decorators are properly configured
- TypeScript experimental decorators are enabled in `tsconfig.json`

## Migration Files Structure

Each migration file has two methods:

```typescript
export class MigrationName1234567890 implements MigrationInterface {
    // Run when applying the migration
    public async up(queryRunner: QueryRunner): Promise<void> {
        // SQL to apply changes
        await queryRunner.query(`CREATE TABLE ...`);
    }

    // Run when reverting the migration
    public async down(queryRunner: QueryRunner): Promise<void> {
        // SQL to undo changes
        await queryRunner.query(`DROP TABLE ...`);
    }
}
```

## Configuration

Migrations are configured in:
- `typeorm.config.ts` - CLI configuration
- `lib/data-source.ts` - Application runtime configuration

Both point to the same migrations directory to ensure consistency.

## Database State Tracking

TypeORM creates a `migrations` table in your database to track which migrations have been executed:

```
migrations
├── id (PK)
├── timestamp
├── name
```

**Never modify this table manually!**

## Resources

- [TypeORM Migrations Documentation](https://typeorm.io/migrations)
- [Railway Deployment Guide](../RAILWAY.md)
- Project `.env.example` for configuration

## Need Help?

Check:
1. This README
2. TypeORM documentation
3. Project's RAILWAY.md for deployment-specific guidance