import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { User } from '@/entities/User';
import { Transcription } from '@/entities/Transcription';
import { Dictionary } from '@/entities/Dictionary';

export const AppDataSource = new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  synchronize: process.env.NODE_ENV === 'development', // Auto-sync in dev only
  logging: process.env.NODE_ENV === 'development',
  entities: [User, Transcription, Dictionary],
  migrations: [__dirname + '/../migrations/**/*{.ts,.js}'],
  subscribers: [],
  // Add connection pool settings for production stability
  extra: {
    max: 10, // Maximum pool size
    connectionTimeoutMillis: 10000,
  },
});

// Initialize connection singleton for Next.js
let dataSourcePromise: Promise<DataSource> | null = null;

export const getDataSource = async (): Promise<DataSource> => {
  if (!dataSourcePromise) {
    dataSourcePromise = AppDataSource.initialize()
      .then((dataSource) => {
        console.log('✅ Database connected successfully');
        return dataSource;
      })
      .catch((error) => {
        console.error('❌ Database connection error:', error);
        dataSourcePromise = null; // Reset on error
        throw error;
      });
  }

  return dataSourcePromise;
};

// Helper to get repository with automatic connection
export async function getRepository<T>(entity: new () => T) {
  const dataSource = await getDataSource();
  return dataSource.getRepository(entity);
}
