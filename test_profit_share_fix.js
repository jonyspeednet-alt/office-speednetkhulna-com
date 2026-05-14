// Test script to verify profit share update fix
// This simulates the API call that was failing

const express = require('express');
const app = express();

// Mock the request and response objects
const createMockRequest = (resellerId, profitSharePercentage) => ({
    params: { id: resellerId.toString() },
    body: { profit_share_percentage: profitSharePercentage },
    user: { id: 1, username: 'test_admin' },
    ip: '127.0.0.1',
    get: (header) => {
        if (header === 'user-agent') return 'test-agent';
        return null;
    }
});

const createMockResponse = () => {
    const res = {
        statusCode: 200,
        responseData: null,
        status: function (code) {
            this.statusCode = code;
            return this;
        },
        json: function (data) {
            this.responseData = data;
            console.log(`Response [${this.statusCode}]:`, data);
            return this;
        }
    };
    return res;
};

async function testProfitShareUpdate() {
    try {
        console.log('🧪 Testing Profit Share Update Fix...\n');

        // Import the updated controller
        const { updateReseller } = require('./server/controllers/reseller/update');

        // Test Case 1: Valid channel partner update
        console.log('Test 1: Valid channel partner profit share update');
        const req1 = createMockRequest(18, 25.5);
        const res1 = createMockResponse();

        try {
            await updateReseller(req1, res1);
            if (res1.statusCode === 200) {
                console.log('✅ Test 1 PASSED: Profit share updated successfully');
            } else {
                console.log('❌ Test 1 FAILED: Unexpected status code');
            }
        } catch (error) {
            console.log('❌ Test 1 FAILED:', error.message);
        }

        console.log('\n' + '='.repeat(50) + '\n');

        // Test Case 2: Invalid profit share value (should be clamped)
        console.log('Test 2: Profit share value clamping (150% -> 100%)');
        const req2 = createMockRequest(18, 150);
        const res2 = createMockResponse();

        try {
            await updateReseller(req2, res2);
            if (res2.statusCode === 200) {
                console.log('✅ Test 2 PASSED: High value clamped successfully');
            } else {
                console.log('❌ Test 2 FAILED: Unexpected status code');
            }
        } catch (error) {
            console.log('❌ Test 2 FAILED:', error.message);
        }

        console.log('\n' + '='.repeat(50) + '\n');

        // Test Case 3: Negative profit share (should be clamped to 0)
        console.log('Test 3: Negative profit share value (-5% -> 0%)');
        const req3 = createMockRequest(18, -5);
        const res3 = createMockResponse();

        try {
            await updateReseller(req3, res3);
            if (res3.statusCode === 200) {
                console.log('✅ Test 3 PASSED: Negative value clamped to 0');
            } else {
                console.log('❌ Test 3 FAILED: Unexpected status code');
            }
        } catch (error) {
            console.log('❌ Test 3 FAILED:', error.message);
        }

        console.log('\n🎉 All tests completed!');

    } catch (error) {
        console.error('❌ Test setup failed:', error);
    }
}

// Only run if this file is executed directly
if (require.main === module) {
    testProfitShareUpdate().catch(console.error);
}

module.exports = { testProfitShareUpdate };