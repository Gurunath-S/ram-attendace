import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().default('postgresql://guru@localhost:5432/ad_garments_attendance'),
  JWT_SECRET: z.string().default('ad-garments-super-secret-jwt-key-2026'),
  JWT_EXPIRES_IN: z.string().default('7d'),
  TIMEZONE: z.string().default('Asia/Kolkata'),
});

export const env = envSchema.parse(process.env);
