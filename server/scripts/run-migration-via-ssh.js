#!/usr/bin/env node

/**
 * Run Phase 1 Migration via SSH
 * Connects to remote server via SSH and executes migration
 */

const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');

const SSH_HOST = '199.188.200.186';
const SSH_PORT = '21098';
const SSH_USER = 'speeuvmq';
const SSH_PASSWORD = 'Speednet@2015#';
const APP_ROOT = '/home/speeuvmq/office_app';

const MIGRATION_FILE = path.join(__dirname, '../migrations/20260513_channel_partner_billing_standardization_phase1.sql');

async function runMigrationViaSSH() {
    console.log('\n╔══════════════════════════════════════════════════════════════════╗');
    console.log('║  Running Phase 1 Migration via SSH                               ║');
    console.log('╚══════════════════════════════════════════════════════════════════╝\n');

    console.log(`SSH Host: ${SSH_HOST}:${SSH_PORT}`);
    console.log(`SSH User: ${SSH_USER}`);
    console.log(`App Root: ${APP_ROOT}\n`);

    // Read migration file
    if (!fs.existsSync(MIGRATION_FILE)) {
        console.error(`✗ Migration file not found: ${MIGRATION_FILE}`);
        process.exit(1);
    }

    const migrationSQL = fs.readFileSync(MIGRATION_FILE, 'utf8');
    console.log(`✓ Migration file loaded (${migrationSQL.length} bytes)\n`);

    // Create temporary SQL file on remote server
    const tempSQLFile = `/tmp/phase1_migration_${Date.now()}.sql`;

    console.log('Step 1: Uploading migration file to server...');

    // Use scp to upload file (requires sshpass or manual password entry)
    const scpCommand = `scp -P ${SSH_PORT} "${MIGRATION_FILE}" ${SSH_USER}@${SSH_HOST}:${tempSQLFile}`;

    console.log('\n⚠️  Manual Steps Required:\n');
    console.log('Since automated SSH with password requires additional tools,');
    console.log('please run these commands manually:\n');

    console.log('1. Upload migration file:');
    console.log(`   scp -P ${SSH_PORT} "${MIGRATION_FILE}" ${SSH_USER}@${SSH_HOST}:${tempSQLFile}`);
    console.log(`   Password: ${SSH_PASSWORD}\n`);

    console.log('2. Connect to server:');
    console.log(`   ssh -p ${SSH_PORT} ${SSH_USER}@${SSH_HOST}`);
    console.log(`   Password: ${SSH_PASSWORD}\n`);

    console.log('3. Run migration:');
    console.log(`   cd ${APP_ROOT}`);
    console.log(`   PGPASSWORD='speednet_office' psql -h localhost -p 5432 -U speeuvmq_speeuvmq -d speeuvmq_speednet_office -f ${tempSQLFile}\n`);

    console.log('4. Verify migration:');
    console.log(`   PGPASSWORD='speednet_office' psql -h localhost -p 5432 -U speeuvmq_speeuvmq -d speeuvmq_speednet_office -c "SELECT column_name FROM information_schema.columns WHERE table_name = 'channel_user_payments' AND column_name IN ('service_period', 'billing_status');"\n`);

    console.log('5. Clean up:');
    console.log(`   rm ${tempSQLFile}\n`);

    console.log('═══════════════════════════════════════════════════════════════════\n');
    console.log('Alternative: Use PuTTY/WinSCP for easier file transfer and SSH access\n');
}

runMigrationViaSSH();
