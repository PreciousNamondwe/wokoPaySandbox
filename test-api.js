// test-api.js
const axios = require('axios');

const API_BASE = 'http://localhost:3000/api';

async function testAPI() {
  console.log('Testing WokoPay API...\n');

  // Test 1: Health check
  try {
    const health = await axios.get(`${API_BASE.replace('/api', '')}/health`);
    console.log('✅ Health check:', health.data);
  } catch (error) {
    console.log('❌ Health check failed:', error.message);
  }

  // Test 2: Verify mobile provider
  try {
    const verify = await axios.post(`${API_BASE}/mobile-money/verify`, {
      phoneNumber: '+265881234567' // Example Malawi number
    });
    console.log('\n✅ Mobile verification:', verify.data);
  } catch (error) {
    console.log('\n❌ Mobile verification failed:', error.message);
  }

  console.log('\n🎉 API testing completed!');
}

testAPI();