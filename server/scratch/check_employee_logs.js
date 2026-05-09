const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const pool = require('../utilities/db');

async function checkLogs() {
  try {
    console.log('Checking recent employee addition logs...');
    const result = await pool.query(`
      SELECT 
        created_at, 
        user_name, 
        action_type, 
        route_path, 
        request_body, 
        response_status, 
        response_body, 
        error_message, 
        success 
      FROM audit_logs 
      WHERE route_path = '/api/employees' AND http_method = 'POST'
      ORDER BY created_at DESC 
      LIMIT 10
    `);

    if (result.rows.length === 0) {
      console.log('No recent employee addition attempts found in audit_logs.');
    } else {
      console.log(JSON.stringify(result.rows, null, 2));
    }
  } catch (error) {
    console.error('Error querying audit_logs:', error);
  } finally {
    await pool.end();
  }
}

checkLogs();
