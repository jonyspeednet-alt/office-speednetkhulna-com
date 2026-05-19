const pool = require('./utilities/db');

async function investigateProfitShareIssue() {
    try {
        console.log('🔍 Debugging Profit Share Update Issue for Reseller ID 18...\n');

        // 1. Check if reseller exists
        console.log('1. Checking if reseller ID 18 exists...');
        const resellerCheck = await pool.query('SELECT id, reseller_name, partner_type FROM resellers WHERE id = $1', [18]);

        if (resellerCheck.rows.length === 0) {
            console.log('❌ Reseller ID 18 not found!');
            return;
        }

        const reseller = resellerCheck.rows[0];
        console.log(`✅ Reseller found: ${reseller.reseller_name} (Partner Type: ${reseller.partner_type})\n`);

        // 2. Check if profit_share_percentage column exists in resellers table
        console.log('2. Checking profit_share_percentage column in resellers table...');
        const columnCheck = await pool.query(`
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
        const settingsTableCheck = await pool.query(`
            SELECT table_name FROM information_schema.tables 
            WHERE table_name = 'channel_partner_profile_settings'
        `);

        if (settingsTableCheck.rows.length > 0) {
            console.log('✅ channel_partner_profile_settings table exists');

            // Check if record exists for reseller 18
            const settingsRecord = await pool.query(`
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
        const currentValues = await pool.query(`
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

        // 5. Test the update logic from the actual controller
        console.log('5. Testing profit share update logic...');

        // Import the actual functions used in the controller
        const { initChannelPartnerTables } = require('./utilities/channelPartnerInit');
        const { initialize, hasChannelPartnerColumns } = require('./controllers/reseller/dbSetup');
        const { parseAmount } = require('./controllers/reseller/utils');

        // Initialize tables
        await initChannelPartnerTables();
        await initialize();

        console.log(`   hasChannelPartnerColumns(): ${hasChannelPartnerColumns()}`);

        // Test the exact update logic from the controller
        const testPsp = 25.5;
        const resellerIdInt = parseInt(18, 10);
        const clampedPsp = Math.max(0, Math.min(100, testPsp));

        console.log(`   Testing with PSP: ${testPsp} -> Clamped: ${clampedPsp}`);

        try {
            // Step 1: Update channel_partner_profile_settings
            console.log('   Step 1: Updating channel_partner_profile_settings...');
            await pool.query(`
                INSERT INTO channel_partner_profile_settings (reseller_id, profit_share_percentage, updated_at)
                VALUES ($1, $2, NOW())
                ON CONFLICT (reseller_id) DO UPDATE SET
                    profit_share_percentage = EXCLUDED.profit_share_percentage,
                    updated_at = NOW()
            `, [resellerIdInt, clampedPsp]);
            console.log('   ✅ Successfully updated channel_partner_profile_settings');

            // Step 2: Sync with resellers table if column exists
            if (hasChannelPartnerColumns()) {
                console.log('   Step 2: Syncing with resellers table...');
                await pool.query(
                    `UPDATE resellers SET profit_share_percentage = $1 WHERE id = $2`,
                    [clampedPsp, resellerIdInt]
                );
                console.log('   ✅ Successfully synced with resellers table');
            } else {
                console.log('   ⚠️ Skipping resellers table sync (column not detected)');
            }

            // Verify the update
            console.log('   Step 3: Verifying update...');
            const verifyUpdate = await pool.query(`
                SELECT 
                    r.profit_share_percentage as reseller_table_psp,
                    cpps.profit_share_percentage as settings_table_psp,
                    cpps.updated_at
                FROM resellers r
                LEFT JOIN channel_partner_profile_settings cpps ON cpps.reseller_id = r.id
                WHERE r.id = $1
            `, [18]);

            if (verifyUpdate.rows.length > 0) {
                const row = verifyUpdate.rows[0];
                console.log('   ✅ Update verification:');
                console.log(`      Resellers table PSP: ${row.reseller_table_psp}`);
                console.log(`      Settings table PSP: ${row.settings_table_psp}`);
                console.log(`      Updated at: ${row.updated_at}`);
            }

        } catch (updateError) {
            console.error('   ❌ Update failed:', updateError.message);
            console.error('   Full error:', updateError);
        }

        // 6. Check for any constraints or triggers
        console.log('\n6. Checking for constraints and triggers...');
        const constraints = await pool.query(`
            SELECT 
                tc.constraint_name,
                tc.constraint_type,
                kcu.column_name,
                tc.table_name
            FROM information_schema.table_constraints tc
            JOIN information_schema.key_column_usage kcu 
                ON tc.constraint_name = kcu.constraint_name
            WHERE tc.table_name IN ('resellers', 'channel_partner_profile_settings')
            AND kcu.column_name LIKE '%profit_share%'
        `);

        if (constraints.rows.length > 0) {
            console.log('Found constraints:');
            constraints.rows.forEach(row => {
                console.log(`   ${row.table_name}.${row.column_name}: ${row.constraint_name} (${row.constraint_type})`);
            });
        } else {
            console.log('No constraints found on profit_share_percentage columns');
        }

        // 7. Test the actual API endpoint logic
        console.log('\n7. Testing API endpoint simulation...');
        try {
            const { updateReseller } = require('./controllers/reseller/update');

            // Create a mock request object
            const mockReq = {
                params: { id: '18' },
                body: { profit_share_percentage: 30.0 },
                user: { id: 1, username: 'test_user' },
                ip: '127.0.0.1',
                get: () => 'test-user-agent'
            };

            const mockRes = {
                json: (data) => {
                    console.log('   ✅ API Response:', data);
                    return mockRes;
                },
                status: (code) => {
                    console.log(`   Status: ${code}`);
                    return mockRes;
                }
            };

            console.log('   Calling updateReseller with profit_share_percentage: 30.0...');
            await updateReseller(mockReq, mockRes);

        } catch (apiError) {
            console.error('   ❌ API test failed:', apiError.message);
            console.error('   Stack:', apiError.stack);
        }

    } catch (error) {
        console.error('❌ Investigation failed:', error);
        console.error('Stack:', error.stack);
    } finally {
        // Close the pool
        await pool.end();
        console.log('\n🔌 Database connection closed');
    }
}

// Run the investigation
investigateProfitShareIssue().catch(console.error);