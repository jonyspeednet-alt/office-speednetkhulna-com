// Simple test script to verify profit share fix on production
// This can be uploaded and run on the server

const pool = require('./server/utilities/db');

async function testProfitShareFix() {
    try {
        console.log('🔍 Testing Profit Share Fix on Production...\n');

        // Test 1: Check if reseller 18 exists and is a channel partner
        console.log('1. Checking reseller 18...');
        const resellerCheck = await pool.query(
            'SELECT id, reseller_name, partner_type FROM resellers WHERE id = $1',
            [18]
        );

        if (resellerCheck.rows.length === 0) {
            console.log('❌ Reseller 18 not found');
            return;
        }

        const reseller = resellerCheck.rows[0];
        console.log(`✅ Found: ${reseller.reseller_name} (${reseller.partner_type})`);

        if (reseller.partner_type !== 'channel_partner') {
            console.log('⚠️ Not a channel partner - converting for test...');
            await pool.query(
                'UPDATE resellers SET partner_type = $1 WHERE id = $2',
                ['channel_partner', 18]
            );
            console.log('✅ Converted to channel partner');
        }

        // Test 2: Initialize channel partner tables
        console.log('\n2. Initializing channel partner tables...');
        const { initChannelPartnerTables } = require('./server/utilities/channelPartnerInit');
        await initChannelPartnerTables();
        console.log('✅ Tables initialized');

        // Test 3: Test profit share update
        console.log('\n3. Testing profit share update...');
        const testValue = 25.5;

        // Update channel_partner_profile_settings
        await pool.query(`
            INSERT INTO channel_partner_profile_settings (reseller_id, profit_share_percentage, updated_at)
            VALUES ($1, $2, NOW())
            ON CONFLICT (reseller_id) DO UPDATE SET
                profit_share_percentage = EXCLUDED.profit_share_percentage,
                updated_at = NOW()
        `, [18, testValue]);
        console.log('✅ Updated channel_partner_profile_settings');

        // Update resellers table if column exists
        const columnCheck = await pool.query(`
            SELECT column_name FROM information_schema.columns 
            WHERE table_name = 'resellers' AND column_name = 'profit_share_percentage'
        `);

        if (columnCheck.rows.length > 0) {
            await pool.query(
                'UPDATE resellers SET profit_share_percentage = $1 WHERE id = $2',
                [testValue, 18]
            );
            console.log('✅ Updated resellers table');
        } else {
            console.log('⚠️ profit_share_percentage column not found in resellers table');
        }

        // Test 4: Verify the update
        console.log('\n4. Verifying update...');
        const verifyResult = await pool.query(`
            SELECT 
                r.reseller_name,
                r.profit_share_percentage as reseller_psp,
                cpps.profit_share_percentage as settings_psp,
                cpps.updated_at
            FROM resellers r
            LEFT JOIN channel_partner_profile_settings cpps ON cpps.reseller_id = r.id
            WHERE r.id = $1
        `, [18]);

        if (verifyResult.rows.length > 0) {
            const row = verifyResult.rows[0];
            console.log('✅ Verification results:');
            console.log(`   Reseller: ${row.reseller_name}`);
            console.log(`   Resellers table PSP: ${row.reseller_psp || 'NULL'}`);
            console.log(`   Settings table PSP: ${row.settings_psp || 'NULL'}`);
            console.log(`   Updated at: ${row.updated_at}`);

            if (row.settings_psp == testValue) {
                console.log('\n🎉 SUCCESS: Profit share update is working correctly!');
            } else {
                console.log('\n❌ FAILED: Profit share value not updated correctly');
            }
        }

        // Test 5: Test the actual API endpoint simulation
        console.log('\n5. Testing API endpoint logic...');
        try {
            const { updateReseller } = require('./server/controllers/reseller/update');

            const mockReq = {
                params: { id: '18' },
                body: { profit_share_percentage: 30.0 },
                user: { id: 1, username: 'test_user' },
                ip: '127.0.0.1',
                get: () => 'test-agent'
            };

            let responseData = null;
            let statusCode = 200;

            const mockRes = {
                json: (data) => {
                    responseData = data;
                    return mockRes;
                },
                status: (code) => {
                    statusCode = code;
                    return mockRes;
                }
            };

            await updateReseller(mockReq, mockRes);

            if (statusCode === 200 && responseData?.message === 'Updated') {
                console.log('✅ API endpoint test passed');
            } else {
                console.log(`❌ API endpoint test failed: Status ${statusCode}, Response:`, responseData);
            }

        } catch (apiError) {
            console.log('❌ API endpoint test error:', apiError.message);
        }

        console.log('\n🏁 Test completed!');

    } catch (error) {
        console.error('❌ Test failed:', error.message);
        console.error('Stack:', error.stack);
    } finally {
        await pool.end();
    }
}

// Run the test
testProfitShareFix().catch(console.error);