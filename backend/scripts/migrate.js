import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const runMigrations = async () => {
  console.log('🗄️ Starting database migrations...');
  
  const client = new pg.Client({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'jericho_security',
    user: process.env.DB_USER || 'jericho',
    password: process.env.DB_PASSWORD || 'jericho_secure_2024'
  });
  
  try {
    await client.connect();
    console.log('✅ Connected to database');
    
    // Read and execute schema file
    const schemaPath = path.join(__dirname, '../src/database/schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');
    
    await client.query(schema);
    console.log('✅ Database schema created successfully');
    
    // Check if tables were created
    const tablesResult = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name;
    `);
    
    console.log('📋 Created tables:', tablesResult.rows.map(row => row.table_name).join(', '));
    
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  } finally {
    await client.end();
  }
  
  console.log('🎉 Database migration completed successfully!');
};

// Run migrations if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runMigrations().catch(console.error);
}

export default runMigrations;
