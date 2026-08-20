const pool = require('./config/database');
const bcrypt = require('bcryptjs');

async function createUsers() {
  try {
    console.log('Creating test accounts in Supabase...\n');

    // 1. Teacher
    const teacherHash = await bcrypt.hash('teacher123', 10);
    await pool.query(
      'INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, $4)',
      ['Dewan Teacher', 'dewan.teacher@kuet.ac.bd', teacherHash, 'teacher']
    );
    console.log('✅ Teacher created: dewan.teacher@kuet.ac.bd / teacher123');

    // 2. Student
    const studentHash = await bcrypt.hash('student123', 10);
    await pool.query(
      'INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, $4)',
      ['Dewan Student', 'dewan.student@kuet.ac.bd', studentHash, 'student']
    );
    console.log('✅ Student created: dewan.student@kuet.ac.bd / student123');

    console.log('\n╔═══════════════════════════════════════════════╗');
    console.log('║  TEST ACCOUNTS CREATED IN SUPABASE! ✅        ║');
    console.log('╚═══════════════════════════════════════════════╝');

    process.exit(0);
  } catch (error) {
    if (error.code === '23505') {
      console.log('\n⚠️  Users already exist in database. Skipping...');
      process.exit(0);
    }
    console.error('❌ Error creating users:', error.message);
    process.exit(1);
  }
}

createUsers();
