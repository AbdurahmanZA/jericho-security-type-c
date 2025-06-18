import pg from 'pg';
import dotenv from 'dotenv';
import readline from 'readline';
import runMigrations from './migrate.js';
import seedDatabase from './seed.js';

// Load environment variables
dotenv.config();

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const question = (query) => {
  return new Promise((resolve) => {
    rl.question(query, resolve);
  });
};

const resetDatabase = async () => {
  console.log('🔄 JERICHO Security Database Reset Utility');
  console.log('==========================================');
  console.log('');
  console.log('⚠️  WARNING: This will completely reset the database!');
  console.log('   • All data will be permanently deleted');
  console.log('   • All tables will be dropped and recreated');
  console.log('   • Default admin user will be recreated');
  console.log('');
  
  const confirm1 = await question('Are you sure you want to reset the database? (type "yes" to confirm): ');
  
  if (confirm1.toLowerCase() !== 'yes') {
    console.log('❌ Database reset cancelled');
    rl.close();
    return;
  }
  
  console.log('');
  console.log('🔥 FINAL WARNING: This action is irreversible!');
  const confirm2 = await question('Type "RESET" to confirm database reset: ');
  
  if (confirm2 !== 'RESET') {
    console.log('❌ Database reset cancelled');
    rl.close();
    return;
  }
  
  rl.close();
  
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
    
    // Get list of all tables
    console.log('📋 Fetching existing tables...');
    const tablesResult = await client.query(`
      SELECT tablename 
      FROM pg_tables 
      WHERE schemaname = 'public'
      ORDER BY tablename;
    `);
    
    const tables = tablesResult.rows.map(row => row.tablename);
    console.log(`📋 Found ${tables.length} tables: ${tables.join(', ')}`);
    
    // Drop all tables
    if (tables.length > 0) {
      console.log('🗑️  Dropping all existing tables...');
      
      // Disable foreign key checks temporarily
      await client.query('SET session_replication_role = replica;');
      
      for (const table of tables) {
        await client.query(`DROP TABLE IF EXISTS "${table}" CASCADE;`);
        console.log(`   ✅ Dropped table: ${table}`);
      }
      
      // Re-enable foreign key checks
      await client.query('SET session_replication_role = DEFAULT;');
      
      console.log('✅ All tables dropped successfully');
    } else {
      console.log('ℹ️  No tables found to drop');
    }
    
    // Drop and recreate extensions if needed
    console.log('🔧 Recreating database extensions...');
    await client.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp";');
    await client.query('CREATE EXTENSION IF NOT EXISTS "pgcrypto";');
    console.log('✅ Extensions created');
    
    await client.end();
    
    // Run migrations to recreate schema
    console.log('');
    console.log('🏗️  Recreating database schema...');
    await runMigrations();
    
    // Seed the database with initial data
    console.log('');
    console.log('🌱 Seeding database with initial data...');
    await seedDatabase();
    
    console.log('');
    console.log('🎉 Database reset completed successfully!');
    console.log('');
    console.log('✅ Your JERICHO Security database has been reset to factory defaults');
    console.log('');
    console.log('🔑 Default Admin Login:');
    console.log('   Username: admin');
    console.log('   Password: admin123');
    console.log('   Email: admin@jericho.local');
    console.log('');
    console.log('⚠️  Important: Please change the admin password immediately after login!');
    
  } catch (error) {
    console.error('❌ Database reset failed:', error.message);
    process.exit(1);
  }
};

// Run reset if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  resetDatabase().catch(console.error);
}

export default resetDatabase;
