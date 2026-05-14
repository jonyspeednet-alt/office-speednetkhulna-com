#!/usr/bin/env node

/**
 * Test Remote Database Connection
 */

const { Pool } = require('pg');

const pool = new Pool({
    host: 'office.speednetkhulna.com',
    port: 5432,
    database: 'speeuvmq_speednet_office',
    user: 'speeuvmq_speeuvmq',
    password: 'speednet_office',
    connectionTimeoutMillis: 10000,
});

async function testConnection() {
    console.log('\n=== Testing Remote Database Connection ===\n');
    console.log('Host: office.speednetkhulna.com');
    console.log('Port: 5432');
    console.log('Database: speeuvmq_speednet_office');
    console.log('User: speeuvmq_speeuvmq');
    console.log('\nConnecting...\n');

    try {
        const result = await pool.query('SELECT NOW() as current_time, current_database() as db_name, version() as pg_version');
        console.log('✓ Connection successful!');
        console.log(`  Current time: ${result.rows[0].current_time}`);
        console.log(`  Database: ${result.rows[0].db_name}`);
        console.log(`  PostgreSQL version: ${result.rows[0].pg_version.split(',')[0]}`);

        // Check if channel_user_payments table exists
        const tableCheck = await pool.query(
            `SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name = 'channel_user_payments') as exists`
        );
        console.log(`\n✓ channel_user_payments table exists: ${tableCheck.rows[0].exists}`);

        // Check if Phase 1 columns exist
        const columnCheck = await pool.query(
            `SELECT column_name FROM information_schema.columns 
       WHERE table_name = 'channel_user_payments' 
       AND column_name IN ('service_period', 'billing_status', 'realized_amount', 'deferred_amount')
       ORDER BY column_name`
        );

        if (columnCheck.rows.length > 0) {
            console.log(`\n✓ Phase 1 columns found (${columnCheck.rows.length}/4):`);
            columnCheck.rows.forEach(r => console.log(`  - ${r.column_name}`));
        } else {
            console.log('\n⚠ Phase 1 columns not found - migration needs to be applied');
        }

        await pool.end();
        process.exit(0);
    } catch (error) {
        console.error('✗ Connection failed:', error.message);
        console.error('\nPossible reasons:');
        console.error('  1. Remote database not accessible from this network');
        console.error('  2. Firewall blocking port 5432');
        console.error('  3. PostgreSQL not configured for remote connections');
        console.error('  4. Wrong credentials or host address');
        await pool.end();
        process.exit(1);
    }
}

testConnection();
