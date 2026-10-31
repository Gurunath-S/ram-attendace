import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { pool } from './index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function runMigration() {
  console.log('--- Applying Database Migrations ---');

  const migrationPath = path.resolve(__dirname, '../../../database/migrations/001_initial_schema.sql');
  if (!fs.existsSync(migrationPath)) {
    console.error(`Migration file not found at: ${migrationPath}`);
    process.exit(1);
  }

  const sql = fs.readFileSync(migrationPath, 'utf8');

  try {
    const client = await pool.connect();
    try {
      console.log('Connected to database. Executing schema...');
      await client.query(sql);
      console.log('✅ Database schema and tables created successfully!');
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('❌ Migration failed:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runMigration();
}
