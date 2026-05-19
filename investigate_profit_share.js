const { Client } = require('pg');
const { spawn } = require('child_process');
const path = require('path');

// SSH tunnel configuration
const SSH_CONFIG = {
    host: '199.188.200.186',
    port: 21098,
    username: 'speeuvmq',
    password: 'Speednet@2015#',
    localPort: 5433,
    remoteHost: 'localhost',
    remotePort: 5432
};

// Database configuration
const DB_CONFIG = {
    host: '127.0.0.1',
    port: 5433,
    database: 'speeuvmq_speednet_office',
    user: 'speeuvmq_speeuvmq',
    password: 'speednet_office'
};

let sshProcess = null;

async function createSSHTunnel() {
    return new Promise((resolve, reject) => {
        console.log('🔗 Creating SSH tunnel...');

        // Use plink for Windows SSH tunnel
        const plinkPath = 'C:\\Program Files\\PuTTY\\plink.exe';
        const args = [
            '-ssh',
            '-P', SSH_CONFIG.port.toString(),
            '-pw', SSH_CONFIG.password,
            '-L', `${SSH_CONFIG.localPort}:${SSH_CONFIG.remoteHost}:${SSH_CONFIG.remotePort}`,
            '-N', // Don't execute remote command
            `${SSH_CONFIG.username}@${SSH_CONFIG.host}`
        ];

        sshProcess = spawn(plinkPath, args);

        sshProcess.stdout.on('data', (data) => {
            console.log(`SSH: ${data}`);
        });

        sshProcess.stderr.on('data', (data) => {
            const output = data.toString();
            console.log(`SSH stderr: ${output}`);

            // Check for successful connection indicators
            if (output.includes('Using username') || output.includes('Authenticating')) {
                setTimeout(() => {
                    console.log('✅ SSH tunnel established');
                    resolve();
                }, 2000);
            }
        });

        sshProcess.on('error', (error) => {
            console.error('❌ SSH tunnel error:', error);
            reject(error);
        });

        sshProcess.on('close', (code) => {
            console.log(`SSH tunnel closed with code ${code}`);
        });
    });
}

async function investigateProfitShareIssue() {
    let client = null;

    try {
        // Create SSH tunnel first
        await createSSHTunnel();

        // Wait a bit for tunnel to be ready
        await new Promise(resolve => setTimeout(resolve, 3000));

        console.log('🔍 Connecting to database...');
        client = new Client(DB_CONFIG);
        await client.connect();
        console.log('✅ Database connected');

        console.log('\n🔍 Debugging Profit Share Update Issue for Reseller ID 18...\n');

        // 1. Check if reseller exists
        console.log('1. Checking if reseller ID 18 exists...');
        const resellerCheck = await client.query('SELECT id, reseller_name, partner_type FROM resellers WHERE id = $1', [18]);

        if (resellerCheck.rows.length === 0) {
            console.log('❌ Reseller ID 18 not found!');
            return;
        }

        const reseller = resellerCheck.rows[0];
        console.log(`✅ Reseller found: ${reseller.reseller_name} (Partner Type: ${reseller.partner_type})\n`);

        // 2. Check if profit_share_percentage column exists in resellers table
        console.log('2. Checking profit_share_percentage column in resellers table...');
        const columnCheck = await client.query(`
            SELECT column_name, data_type, is_nullable, column_default
            FROM information_schema.columns 
            WHERE table_name = 'resellers' 
            AND column_name = 'profit_share_percentage'
        `);

        if (columnCheck.rows.length > 0) {
            console.log('✅ profit_share_percentage column exists in resellers table');
            console.log(`   Type: ${columnCheck.rows[0].data_type}, Nullable: ${columnCheck.rows[0].is_nullable}, Default: ${columnCheck.rows[0].column_default}\n`);
        } else {
            console.log('❌ profit_share_percentage column does NOT exist in resellers table\n');
        }

        // 3. Check channel_partner_profile_settings table
        console.log('3. Checking channel_partner_profile_settings table...');
        const settingsTableCheck = await client.query(`
            SELECT table_name FROM information_schema.tables 
            WHERE table_name = 'channel_partner_profile_settings'
        `);

        if (settingsTableCheck.rows.length > 0) {
            console.log('✅ channel_partner_profile_settings table exists');

            // Check if record exists for reseller 18
            const settingsRecord = await client.query(`
                SELECT reseller_id, profit_share_percentage, updated_at 
                FROM channel_partner_profile_settings 
                WHERE reseller_id = $1
            `, [18]);

            if (settingsRecord.rows.length > 0) {
                console.log('✅ Settings record exists for reseller 18:');
                console.log(`   Profit Share: ${settingsRecord.rows[0].profit_share_percentage}%`);
                console.log(`   Updated: ${settingsRecord.rows[0].updated_at}\n`);
            } else {
                console.log('❌ No settings record found for reseller 18\n');
            }
        } else {
            console.log('❌ channel_partner_profile_settings table does NOT exist\n');
        }

        // 4. Check current profit share value from both sources
        console.log('4. Checking current profit share values...');
        const currentValues = await client.query(`
            SELECT 
                r.id,
                r.reseller_name,
                r.profit_share_percentage as reseller_table_psp,
                cpps.profit_share_percentage as settings_table_psp,
                cpps.updated_at as settings_updated_at
            FROM resellers r
            LEFT JOIN channel_partner_profile_settings cpps ON cpps.reseller_id = r.id
            WHERE r.id = $1
        `, [18]);

        if (currentValues.rows.length > 0) {
            const row = currentValues.rows[0];
            console.log('Current values:');
            console.log(`   Resellers table PSP: ${row.reseller_table_psp || 'NULL'}`);
            console.log(`   Settings table PSP: ${row.settings_table_psp || 'NULL'}`);
            console.log(`   Settings updated: ${row.settings_updated_at || 'NULL'}\n`);
        }

        // 5. Test update operation
        console.log('5. Testing profit share update...');
        try {
            // First, try to insert/update in channel_partner_profile_settings
            await client.query(`
                INSERT INTO channel_partner_profile_settings (reseller_id, profit_share_percentage, updated_at)
                VALUES ($1, $2, NOW())
                ON CONFLICT (reseller_id) DO UPDATE SET
                    profit_share_percentage = EXCLUDED.profit_share_percentage,
                    updated_at = NOW()
            `, [18, 15.5]);
            console.log('✅ Successfully updated channel_partner_profile_settings');

            // Then try to update resellers table if column exists
            if (columnCheck.rows.length > 0) {
                await client.query(
                    `UPDATE resellers SET profit_share_percentage = $1 WHERE id = $2`,
                    [15.5, 18]
                );
                console.log('✅ Successfully updated resellers table');
            }

            // Verify the update
            const verifyUpdate = await client.query(`
                SELECT 
                    r.profit_share_percentage as reseller_table_psp,
                    cpps.profit_share_percentage as settings_table_psp
                FROM resellers r
                LEFT JOIN channel_partner_profile_settings cpps ON cpps.reseller_id = r.id
                WHERE r.id = $1
            `, [18]);

            if (verifyUpdate.rows.length > 0) {
                const row = verifyUpdate.rows[0];
                console.log('✅ Update verification:');
                console.log(`   Resellers table PSP: ${row.reseller_table_psp}`);
                console.log(`   Settings table PSP: ${row.settings_table_psp}`);
            }

        } catch (updateError) {
            console.error('❌ Update failed:', updateError.message);
            console.error('Full error:', updateError);
        }

        // 6. Check for any constraints or triggers
        console.log('\n6. Checking for constraints and triggers...');
        const constraints = await client.query(`
            SELECT 
                tc.constraint_name,
                tc.constraint_type,
                kcu.column_name
            FROM information_schema.table_constraints tc
            JOIN information_schema.key_column_usage kcu 
                ON tc.constraint_name = kcu.constraint_name
            WHERE tc.table_name IN ('resellers', 'channel_partner_profile_settings')
            AND kcu.column_name = 'profit_share_percentage'
        `);

        if (constraints.rows.length > 0) {
            console.log('Found constraints:');
            constraints.rows.forEach(row => {
                console.log(`   ${row.constraint_name}: ${row.constraint_type} on ${row.column_name}`);
            });
        } else {
            console.log('No constraints found on profit_share_percentage columns');
        }

        // 7. Check recent error logs (if any logging table exists)
        console.log('\n7. Checking for recent errors...');
        try {
            const errorLogs = await client.query(`
                SELECT * FROM pg_stat_activity 
                WHERE state = 'active' 
                AND query LIKE '%profit_share_percentage%'
                LIMIT 5
            `);

            if (errorLogs.rows.length > 0) {
                console.log('Active queries involving profit_share_percentage:');
                errorLogs.rows.forEach(row => {
                    console.log(`   PID: ${row.pid}, Query: ${row.query.substring(0, 100)}...`);
                });
            } else {
                console.log('No active queries involving profit_share_percentage');
            }
        } catch (e) {
            console.log('Could not check active queries (insufficient permissions)');
        }

    } catch (error) {
        console.error('❌ Investigation failed:', error);
    } finally {
        if (client) {
            await client.end();
            console.log('🔌 Database connection closed');
        }

        if (sshProcess) {
            sshProcess.kill();
            console.log('🔗 SSH tunnel closed');
        }
    }
}

// Run the investigation
investigateProfitShareIssue().catch(console.error);