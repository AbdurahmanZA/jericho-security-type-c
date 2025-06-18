import bcrypt from 'bcryptjs';
import pg from 'pg';
import dotenv from 'dotenv';
import { v4 as uuidv4 } from 'uuid';

// Load environment variables
dotenv.config();

const seedDatabase = async () => {
  console.log('🌱 Starting database seeding...');
  
  const client = new pg.Client({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'jericho_security',
    user: process.env.DB_USER || 'jericho',
    password: process.env.DB_PASSWORD || 'jericho_secure_2024'
  });
  
  try {
    await client.connect();
    console.log('✅ Connected to database for seeding');
    
    // Create default admin user
    console.log('👤 Creating default admin user...');
    const adminPassword = await bcrypt.hash('admin123', 12);
    
    await client.query(`
      INSERT INTO users (id, username, email, password, role, first_name, last_name, is_active, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
      ON CONFLICT (username) DO UPDATE SET
        password = EXCLUDED.password,
        updated_at = NOW()
    `, [
      uuidv4(),
      'admin',
      'admin@jericho.local',
      adminPassword,
      'admin',
      'System',
      'Administrator',
      true
    ]);
    
    console.log('✅ Default admin user created/updated');
    console.log('📧 Username: admin');
    console.log('🔐 Password: admin123');
    
    // Create default system settings
    console.log('⚙️ Creating default system settings...');
    const defaultSettings = [
      { key: 'system_name', value: 'JERICHO Security Type C', category: 'general' },
      { key: 'max_cameras', value: '32', category: 'limits' },
      { key: 'recording_retention_days', value: '30', category: 'recording' },
      { key: 'motion_sensitivity', value: 'medium', category: 'motion' },
      { key: 'max_concurrent_streams', value: '16', category: 'streaming' },
      { key: 'enable_motion_detection', value: 'true', category: 'motion' },
      { key: 'enable_recording', value: 'true', category: 'recording' },
      { key: 'timezone', value: 'UTC', category: 'general' },
      { key: 'date_format', value: 'YYYY-MM-DD', category: 'general' },
      { key: 'time_format', value: '24h', category: 'general' }
    ];
    
    for (const setting of defaultSettings) {
      await client.query(`
        INSERT INTO system_settings (id, setting_key, setting_value, category, created_at, updated_at)
        VALUES ($1, $2, $3, $4, NOW(), NOW())
        ON CONFLICT (setting_key) DO UPDATE SET
          setting_value = EXCLUDED.setting_value,
          updated_at = NOW()
      `, [uuidv4(), setting.key, setting.value, setting.category]);
    }
    
    console.log('✅ Default system settings created');
    
    // Create default camera groups
    console.log('📹 Creating default camera groups...');
    const defaultGroups = [
      { name: 'Indoor Cameras', description: 'Cameras located inside the building' },
      { name: 'Outdoor Cameras', description: 'Cameras located outside the building' },
      { name: 'Entrance Cameras', description: 'Cameras monitoring entrances and exits' },
      { name: 'Parking Cameras', description: 'Cameras monitoring parking areas' }
    ];
    
    for (const group of defaultGroups) {
      await client.query(`
        INSERT INTO camera_groups (id, name, description, created_at, updated_at)
        VALUES ($1, $2, $3, NOW(), NOW())
        ON CONFLICT (name) DO NOTHING
      `, [uuidv4(), group.name, group.description]);
    }
    
    console.log('✅ Default camera groups created');
    
    // Create default alert types
    console.log('🚨 Creating default alert types...');
    const alertTypes = [
      { name: 'Motion Detected', severity: 'medium', enabled: true },
      { name: 'Camera Offline', severity: 'high', enabled: true },
      { name: 'Recording Failed', severity: 'high', enabled: true },
      { name: 'Storage Full', severity: 'critical', enabled: true },
      { name: 'System Startup', severity: 'info', enabled: true },
      { name: 'System Shutdown', severity: 'info', enabled: true },
      { name: 'User Login', severity: 'low', enabled: true },
      { name: 'Configuration Changed', severity: 'medium', enabled: true }
    ];
    
    for (const alertType of alertTypes) {
      await client.query(`
        INSERT INTO alert_types (id, name, severity, enabled, created_at, updated_at)
        VALUES ($1, $2, $3, $4, NOW(), NOW())
        ON CONFLICT (name) DO UPDATE SET
          severity = EXCLUDED.severity,
          enabled = EXCLUDED.enabled,
          updated_at = NOW()
      `, [uuidv4(), alertType.name, alertType.severity, alertType.enabled]);
    }
    
    console.log('✅ Default alert types created');
    
    // Verify seeded data
    const userCount = await client.query('SELECT COUNT(*) FROM users');
    const settingsCount = await client.query('SELECT COUNT(*) FROM system_settings');
    const groupsCount = await client.query('SELECT COUNT(*) FROM camera_groups');
    const alertTypesCount = await client.query('SELECT COUNT(*) FROM alert_types');
    
    console.log('📊 Seeding summary:');
    console.log(`   👤 Users: ${userCount.rows[0].count}`);
    console.log(`   ⚙️ Settings: ${settingsCount.rows[0].count}`);
    console.log(`   📹 Camera Groups: ${groupsCount.rows[0].count}`);
    console.log(`   🚨 Alert Types: ${alertTypesCount.rows[0].count}`);
    
  } catch (error) {
    console.error('❌ Seeding failed:', error.message);
    process.exit(1);
  } finally {
    await client.end();
  }
  
  console.log('🎉 Database seeding completed successfully!');
  console.log('');
  console.log('🔑 Login Credentials:');
  console.log('   Username: admin');
  console.log('   Password: admin123');
  console.log('   Email: admin@jericho.local');
  console.log('');
  console.log('⚠️  Please change the admin password after first login!');
};

// Run seeding if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  seedDatabase().catch(console.error);
}

export default seedDatabase;
