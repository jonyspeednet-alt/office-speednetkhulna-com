const pool = require('./server/utilities/db');

async function debugProfitShareIssue() {
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
                console.log(`✅ Settings record exists for reseller 18: ${settingsRecord.rows[0].profit_share_percentage}%`);
                console.log(`   Last updated: ${settingsRecord.rows[0].updated_at}\n`);
            } else {
                console.log('⚠️  No settings record found for reseller 18\n');
            }
        } else {
            console.log('❌ channel_partner_profile_settings table does NOT exist\n');
        }

        // 4. Check current profit share value
        console.log('4. Checking current profit share value...');
        const currentValue = await pool.query(`
      SELECT r.id, r.reseller_name,
             COALESCE(r.profit_share_percentage, 0) as reseller_psp,
             COALESCE(cpps.profit_share_percentage, 0) as settings_psp
      FROM resellers r
      LEFT JOIN channel_partner_profile_settings cpps ON cpps.reseller_id = r.id
      WHERE r.id = $1
    `, [18]);

        if (currentValue.rows.length > 0) {
            const row = currentValue.rows[0];
            console.log(`Current values for ${row.reseller_name}:`);
            console.log(`   Resellers table: ${row.reseller_psp}%`);
            console.log(`   Settings table: ${row.settings_psp}%\n`);
        }

        // 5. Test update operation
        console.log('5. Testing profit share update...');
        const testValue = 15.50;

        try {
            // First, try to insert/update in channel_partner_profile_settings
            await pool.query(`
        INSERT INTO channel_partner_profile_settings (reseller_id, profit_share_percentage, updated_at)
        VALUES ($1, $2, NOW())
        ON CONFLICT (reseller_id) DO UPDATE SET
          profit_share_percentage = EXCLUDED.profit_share_percentage,
          updated_at = NOW()
      `, [18, testValue]);

            console.log(`✅ Successfully updated channel_partner_profile_settings to ${testValue}%`);

            // Check if resellers table has the column and update it
            if (columnCheck.rows.length > 0) {
                await pool.query(`
          UPDATE resellers SET profit_share_percentage = $1 WHERE id = $2
        `, [testValue, 18]);
                console.log(`✅ Successfully updated resellers table to ${testValue}%`);
            }

            // Verify the update
            const verifyUpdate = await pool.query(`
        SELECT r.id, r.reseller_name,
               COALESCE(r.profit_share_percentage, 0) as reseller_psp,
               COALESCE(cpps.profit_share_percentage, 0) as settings_psp
        FROM resellers r
        LEFT JOIN channel_partner_profile_settings cpps ON cpps.reseller_id = r.id
        WHERE r.id = $1
      `, [18]);

            if (verifyUpdate.rows.length > 0) {
                const row = verifyUpdate.rows[0];
                console.log(`\n✅ Update verified:`);
                console.log(`   Resellers table: ${row.reseller_psp}%`);
                console.log(`   Settings table: ${row.settings_psp}%`);
            }

        } catch (updateError) {
            console.log('❌ Update failed:', updateError.message);
            console.log('Error details:', updateError);
        }

        // 6. Check for any constraints or triggers
        console.log('\n6. Checking for constraints and triggers...');
        const constraints = await pool.query(`
      SELECT conname, contype, pg_get_constraintdef(oid) as definition
      FROM pg_constraint 
      WHERE conrelid = 'resellers'::regclass
      AND conname LIKE '%profit%'
    `);

        if (constraints.rows.length > 0) {
            console.log('Found profit-related constraints:');
            constraints.rows.forEach(row => {
                console.log(`   ${row.conname} (${row.contype}): ${row.definition}`);
            });
        } else {
            console.log('No profit-related constraints found');
        }

        // 7. Check for any recent error logs in the application
        console.log('\n7. Checking for any permission issues...');
        try {
            await pool.query('SELECT 1 FROM resellers LIMIT 1');
            console.log('✅ Basic SELECT permission works');

            await pool.query('UPDATE resellers SET last_activity_date = NOW() WHERE id = $1', [18]);
            console.log('✅ Basic UPDATE permission works');

        } catch (permError) {
            console.log('❌ Permission error:', permError.message);
        }

    } catch (error) {
        console.error('❌ Debug script failed:', error);
    }
}

// Run the debug script
debugProfitShareIssue();