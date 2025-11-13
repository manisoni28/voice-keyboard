import 'reflect-metadata';
import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';

// Load environment variables from .env.local for local development
dotenv.config({ path: '.env.local' });

export const AppDataSource = new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  synchronize: false, // Never auto-sync when using migrations
  logging: true,
  entities: ['entities/**/*.ts'],
  migrations: ['migrations/**/*.ts'],
  subscribers: [],
});

// Initialize data source for CLI usage
AppDataSource.initialize()
  .then(() => {
    console.log('Data Source has been initialized for migrations!');
  })
  .catch((err) => {
    console.error('Error during Data Source initialization:', err);
  });

export default AppDataSource;