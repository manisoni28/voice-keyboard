import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { config } from 'dotenv';
import * as path from 'path';

// Load environment variables from .env.local for local development
config({ path: path.join(__dirname, '.env.local') });

// Also try loading from .env if .env.local doesn't exist
if (!process.env.DATABASE_URL) {
  config();
}

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set in environment variables!');
  console.error('Make sure you have .env.local file with DATABASE_URL configured.');
  process.exit(1);
}

const AppDataSource = new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  synchronize: false, // Never auto-sync when using migrations
  logging: true,
  entities: [path.join(__dirname, 'entities/**/*.{ts,js}')],
  migrations: [path.join(__dirname, 'migrations/**/*.{ts,js}')],
  subscribers: [],
});

export default AppDataSource;