# Railway Deployment Guide

This guide will help you deploy your voice-keyboard application to Railway.

## Prerequisites

1. A Railway account (sign up at [railway.app](https://railway.app))
2. Railway CLI installed (optional): `npm install -g @railway/cli`

## Step 1: Create a New Project on Railway

1. Go to [railway.app](https://railway.app) and create a new project
2. Connect your GitHub repository

## Step 2: Add PostgreSQL Database

1. In your Railway project, click "New" → "Database" → "Add PostgreSQL"
2. Railway will automatically provision a PostgreSQL database
3. The `DATABASE_URL` environment variable will be automatically added

## Step 3: Configure Environment Variables

In your Railway project settings, add the following environment variables:

### Required Variables

```bash
# Database (automatically set by Railway's Postgres plugin)
DATABASE_URL=<automatically-provided-by-railway>

# NextAuth Secret (CRITICAL - Generate a new one!)
# Run this command locally to generate: openssl rand -base64 32
NEXTAUTH_SECRET=<paste-your-generated-secret-here>

# NextAuth URL (Your Railway app domain)
# Find this in Railway dashboard under Settings → Domains
# Format: https://your-app-name.up.railway.app
NEXTAUTH_URL=https://your-app-name.up.railway.app

# Gemini API Key
GEMINI_API_KEY=<your-gemini-api-key>

# Node Environment
NODE_ENV=production
```

### How to Generate NEXTAUTH_SECRET

Run this command in your terminal:
```bash
openssl rand -base64 32
```

Copy the output and paste it as the value for `NEXTAUTH_SECRET`.

## Step 4: Initialize Database Tables

Since `synchronize: false` in production, you need to run migrations to create the database tables.

### Recommended: Use TypeORM Migrations

The project includes an initial migration that creates all necessary tables and indexes.

#### Run Migrations on Railway

**Option 1: Using Railway CLI (Recommended)**

1. Install Railway CLI if you haven't already:
   ```bash
   npm install -g @railway/cli
   ```

2. Login and link to your project:
   ```bash
   railway login
   railway link
   ```

3. Run migrations against your Railway database:
   ```bash
   railway run npm run migration:run
   ```

**Option 2: Using One-off Command in Railway Dashboard**

1. Go to your Railway project
2. Click on your service
3. Go to "Settings" → "Deploy"
4. Under "One-off Commands", enter:
   ```bash
   npm install && npm run migration:run
   ```
5. Click "Run"

**Option 3: Add to Build/Start Process**

You can add migration run to your start script. Update `package.json`:
```json
"scripts": {
  "start:migrate": "npm run migration:run && npm run start"
}
```

Then set this as your start command in Railway settings.

⚠️ **Note**: Running migrations on every start can slow down deployment. Consider using Option 1 or 2 for better control.

### Alternative: Manual SQL (Not Recommended)

If you prefer to run SQL directly, you can connect to Railway PostgreSQL and execute the SQL from the migration file at `migrations/1700000000000-InitialSchema.ts`.

## Step 5: Deploy

Railway will automatically deploy when you push to your connected branch.

To manually trigger a deployment:
1. Go to your Railway project
2. Click on your service
3. Click "Deploy"

## Step 6: Get Your Railway Domain

1. In Railway dashboard, go to Settings → Domains
2. Railway provides a free domain: `your-app-name.up.railway.app`
3. You can also add a custom domain

**IMPORTANT:** Update the `NEXTAUTH_URL` environment variable with your Railway domain!

## Working with Migrations Locally

### Available Migration Commands

```bash
# Show pending migrations
npm run migration:show

# Run pending migrations
npm run migration:run

# Revert last migration
npm run migration:revert

# Generate a new migration from entity changes
npm run migration:generate migrations/NewMigrationName

# Create an empty migration file
npm run migration:create migrations/NewMigrationName
```

### Creating New Migrations

When you make changes to your entities:

1. Generate a migration:
   ```bash
   npm run migration:generate migrations/AddNewFeature
   ```

2. Review the generated migration file in `migrations/` directory

3. Test locally:
   ```bash
   npm run migration:run
   ```

4. Commit the migration file to git

5. Deploy to Railway, then run migrations using Railway CLI

## Troubleshooting

### Error: "Entity metadata for [weird-name] was not found"

This was caused by Next.js production builds mangling TypeORM entity names. **This should now be fixed** by using proper entity references.

### Error: "UntrustedHost: Host must be trusted"

This was caused by NextAuth not trusting the Railway domain. **This should now be fixed** by adding `trustHost: true` to the NextAuth configuration.

### Database Connection Errors

1. Verify `DATABASE_URL` is set correctly in Railway
2. Check that the PostgreSQL service is running
3. View logs: Railway Dashboard → Deployments → View Logs

### Tables Don't Exist

Run migrations as described in Step 4 above.

### Migration Errors

**"No migrations found"**
- Make sure you've committed the migrations directory to git
- Check that Railway has the latest code deployed

**"Migration has already been executed"**
- This is normal if migrations have already run
- Use `npm run migration:show` to see migration status

**"Connection timeout"**
- Your Railway database might be sleeping (on free tier)
- Try again in a few seconds

### Authentication Not Working

1. Verify `NEXTAUTH_SECRET` is set and is a strong random string
2. Verify `NEXTAUTH_URL` matches your Railway domain (including `https://`)
3. Check Railway logs for authentication errors

### App Crashes on Startup

1. Check Railway logs for specific errors
2. Verify all environment variables are set correctly
3. Ensure `NODE_ENV=production` is set
4. Verify migrations have been run successfully

## Monitoring

- **Logs**: Railway Dashboard → Deployments → View Logs
- **Metrics**: Railway Dashboard → Metrics tab
- **Database**: Railway Dashboard → PostgreSQL service → Data tab

## Security Checklist

- [ ] Generated a strong, random `NEXTAUTH_SECRET`
- [ ] `NEXTAUTH_URL` points to your production domain (HTTPS)
- [ ] `NODE_ENV=production` is set
- [ ] Database credentials are not committed to git
- [ ] `.env.local` is in `.gitignore`

## Local Development vs Production

| Setting | Development | Production (Railway) |
|---------|-------------|---------------------|
| `DATABASE_URL` | Local postgres | Railway PostgreSQL |
| `NEXTAUTH_SECRET` | Any value | Strong random string |
| `NEXTAUTH_URL` | http://localhost:3000 | https://your-app.railway.app |
| `NODE_ENV` | development | production |
| DB Synchronize | Enabled | Disabled (manual tables) |
| SSL | Disabled | Enabled |

## Useful Railway Commands

```bash
# Login to Railway CLI
railway login

# Link to your project
railway link

# View logs
railway logs

# Open Railway dashboard
railway open

# Run commands in Railway environment
railway run npm run build
```

## Next Steps

1. Set up a custom domain (optional)
2. Configure monitoring and alerts
3. Set up CI/CD for automated deployments
4. Add database backups (Railway provides automatic backups)

## Support

- Railway Documentation: https://docs.railway.app
- Railway Discord: https://discord.gg/railway
- NextAuth Documentation: https://next-auth.js.org
- TypeORM Documentation: https://typeorm.io