#!/usr/bin/env node

/**
 * Detailed Debug Script for Profit Share Update Issue
 * This script will:
 * 1. Check database connectivity
 * 2. Verify table existence and structure
 * 3. Attempt the profit share update with detailed error logging
 */

// Load environment variables FIRST
require("./server/config/env");

const pool = require("./server/utilities/db");

const colors = {
  reset: "\x1b[0m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
};

function log(message, color = "reset") {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

async function checkDatabaseConnection() {
  log("\n=== 1. Checking Database Connection ===", "blue");
  try {
    const result = await pool.query("SELECT NOW()");
    log(`✓ Database connected at ${result.rows[0].now}`, "green");
    return true;
  } catch (error) {
    log(`✗ Database connection failed: ${error.message}`, "red");
    log(`  Error code: ${error.code}`, "red");
    return false;
  }
}

async function checkReseller18Exists() {
  log("\n=== 2. Checking if Reseller 18 Exists ===", "blue");
  try {
    const result = await pool.query(
      "SELECT id, reseller_name, partner_type FROM resellers WHERE id = 18"
    );
    if (result.rows.length === 0) {
      log(`✗ Reseller 18 not found`, "red");
      return false;
    }
    const reseller = result.rows[0];
    log(`✓ Reseller found:`, "green");
    log(`  ID: ${reseller.id}`, "cyan");
    log(`  Name: ${reseller.reseller_name}`, "cyan");
    log(`  Partner Type: ${reseller.partner_type}`, "cyan");
    return true;
  } catch (error) {
    log(`✗ Error checking reseller: ${error.message}`, "red");
    return false;
  }
}

async function checkChannelPartnerProfileSettingsTable() {
  log("\n=== 3. Checking channel_partner_profile_settings Table ===", "blue");
  try {
    // Check if table exists
    const tableCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'channel_partner_profile_settings'
      )
    `);
    
    if (!tableCheck.rows[0].exists) {
      log(`✗ Table 'channel_partner_profile_settings' does NOT exist`, "red");
      log(`  Need to create it...`, "yellow");
      return false;
    }
    
    log(`✓ Table 'channel_partner_profile_settings' exists`, "green");
    
    // Check table structure
    const columnCheck = await pool.query(`
      SELECT column_name, data_type, column_default
      FROM information_schema.columns
      WHERE table_name = 'channel_partner_profile_settings'
      ORDER BY ordinal_position
    `);
    
    log(`  Columns:`, "cyan");
    for (const col of columnCheck.rows) {
      log(
        `    - ${col.column_name}: ${col.data_type} (default: ${col.column_default || "none"})`,
        "cyan"
      );
    }
    
    // Check if reseller 18 has a record
    const settingsCheck = await pool.query(
      "SELECT * FROM channel_partner_profile_settings WHERE reseller_id = 18"
    );
    if (settingsCheck.rows.length > 0) {
      log(`  ✓ Reseller 18 has settings:`, "green");
      log(
        `    Profit Share: ${settingsCheck.rows[0].profit_share_percentage}%`,
        "cyan"
      );
      log(
        `    Updated At: ${settingsCheck.rows[0].updated_at}`,
        "cyan"
      );
    } else {
      log(`  ✗ Reseller 18 has no settings record yet`, "yellow");
    }
    
    return true;
  } catch (error) {
    log(`✗ Error checking table: ${error.message}`, "red");
    log(`  Error code: ${error.code}`, "red");
    return false;
  }
}

async function checkProfitShareColumnInResellers() {
  log("\n=== 4. Checking profit_share_percentage Column in resellers Table ===", "blue");
  try {
    const columnCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.columns 
        WHERE table_name = 'resellers' AND column_name = 'profit_share_percentage'
      )
    `);
    
    if (!columnCheck.rows[0].exists) {
      log(`✗ Column 'profit_share_percentage' does NOT exist in resellers table`, "red");
      return false;
    }
    
    log(`✓ Column 'profit_share_percentage' exists in resellers table`, "green");
    
    // Get the value for reseller 18
    const valueCheck = await pool.query(
      "SELECT profit_share_percentage FROM resellers WHERE id = 18"
    );
    if (valueCheck.rows.length > 0) {
      log(
        `  Reseller 18 profit_share_percentage: ${valueCheck.rows[0].profit_share_percentage}`,
        "cyan"
      );
    }
    
    return true;
  } catch (error) {
    log(`✗ Error checking column: ${error.message}`, "red");
    return false;
  }
}

async function attemptProfitShareUpdate() {
  log("\n=== 5. Attempting Profit Share Update for Reseller 18 ===", "blue");
  const testPercentage = 15.5;
  
  try {
    // First, ensure channel partner tables exist
    log(`  Initializing channel partner tables...`, "yellow");
    const { initChannelPartnerTables } = require("./server/utilities/channelPartnerInit");
    await initChannelPartnerTables();
    log(`  ✓ Channel partner tables initialized`, "green");
    
    // Validate partner type
    log(`  Validating partner type...`, "yellow");
    const partnerCheck = await pool.query(
      "SELECT partner_type FROM resellers WHERE id = 18"
    );
    
    if (partnerCheck.rows.length === 0) {
      log(`  ✗ Reseller not found`, "red");
      return false;
    }
    
    if (partnerCheck.rows[0].partner_type !== "channel_partner") {
      log(
        `  ✗ Reseller is not a channel partner (type: ${partnerCheck.rows[0].partner_type})`,
        "red"
      );
      return false;
    }
    log(`  ✓ Reseller is a channel partner`, "green");
    
    // Attempt the INSERT...ON CONFLICT
    log(`  Attempting INSERT INTO channel_partner_profile_settings...`, "yellow");
    const updateResult = await pool.query(
      `INSERT INTO channel_partner_profile_settings (reseller_id, profit_share_percentage, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (reseller_id) DO UPDATE SET
           profit_share_percentage = EXCLUDED.profit_share_percentage,
           updated_at = NOW()`,
      [18, testPercentage]
    );
    log(`  ✓ INSERT successful`, "green");
    log(`  Rows affected: ${updateResult.rowCount}`, "cyan");
    
    // Update resellers table if column exists
    log(`  Updating resellers table...`, "yellow");
    const resellerUpdateResult = await pool.query(
      "UPDATE resellers SET profit_share_percentage = $1 WHERE id = 18",
      [testPercentage]
    );
    log(`  ✓ resellers table updated`, "green");
    log(`  Rows affected: ${resellerUpdateResult.rowCount}`, "cyan");
    
    // Verify the update
    log(`  Verifying update...`, "yellow");
    const verifyResult = await pool.query(
      `SELECT r.id,
              r.profit_share_percentage as reseller_psp,
              cpps.profit_share_percentage as settings_psp,
              cpps.updated_at
       FROM resellers r
       LEFT JOIN channel_partner_profile_settings cpps ON cpps.reseller_id = r.id
       WHERE r.id = 18`
    );
    
    if (verifyResult.rows.length > 0) {
      const row = verifyResult.rows[0];
      log(`  ✓ Update verified:`, "green");
      log(`    Resellers table: ${row.reseller_psp}%`, "cyan");
      log(`    Settings table: ${row.settings_psp}%`, "cyan");
      log(`    Updated at: ${row.updated_at}`, "cyan");
      return true;
    }
    
    return false;
  } catch (error) {
    log(`✗ Update failed: ${error.message}`, "red");
    log(`  Error code: ${error.code}`, "red");
    log(`  Stack:`, "yellow");
    log(`    ${error.stack}`, "red");
    return false;
  }
}

async function main() {
  log("\n╔════════════════════════════════════════════════════════════╗", "cyan");
  log("║   PROFIT SHARE UPDATE - DETAILED DEBUG SCRIPT               ║", "cyan");
  log("║   Target: Reseller ID 18                                   ║", "cyan");
  log("╚════════════════════════════════════════════════════════════╝", "cyan");
  
  const checks = [
    checkDatabaseConnection,
    checkReseller18Exists,
    checkChannelPartnerProfileSettingsTable,
    checkProfitShareColumnInResellers,
    attemptProfitShareUpdate,
  ];
  
  for (const check of checks) {
    try {
      await check();
    } catch (error) {
      log(`\n✗ Unexpected error in ${check.name}: ${error.message}`, "red");
      log(`  Stack: ${error.stack}`, "red");
    }
  }
  
  log("\n╔════════════════════════════════════════════════════════════╗", "cyan");
  log("║   DEBUG COMPLETE                                           ║", "cyan");
  log("╚════════════════════════════════════════════════════════════╝", "cyan");
  
  process.exit(0);
}

main().catch((error) => {
  log(`\nFatal error: ${error.message}`, "red");
  log(error.stack, "red");
  process.exit(1);
});
