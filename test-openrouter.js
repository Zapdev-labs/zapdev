#!/usr/bin/env node

/**
 * Test script for OpenRouter API integration
 * Run this script to verify that OpenRouter is configured correctly
 * 
 * Usage: node test-openrouter.js
 * 
 * Make sure you have set the following environment variables in .env.local:
 * - OPENROUTER_API_KEY
 * - OPENROUTER_BASE_URL
 */

require('dotenv').config({ path: '.env.local' });

async function testOpenRouter() {
  const apiKey = process.env.OPENROUTER_API_KEY;
  const baseUrl = process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1/';

  if (!apiKey) {
    console.error('❌ Error: OPENROUTER_API_KEY is not set in .env.local');
    console.log('Please add your OpenRouter API key to .env.local:');
    console.log('OPENROUTER_API_KEY="your-api-key-here"');
    process.exit(1);
  }

  console.log('🔧 Testing OpenRouter connection...');
  console.log(`📍 Base URL: ${baseUrl}`);
  // Security: Never log full API keys - only show first 7 and last 4 characters
  const maskedKey = apiKey.length > 11 
    ? `${apiKey.substring(0, 7)}...${apiKey.substring(apiKey.length - 4)}`
    : '***';
  console.log(`🔑 API Key: ${maskedKey}`);
  console.log('');

  try {
    // Test with a simple completion request
    const response = await fetch(`${baseUrl}chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'openai/gpt-4o-mini',
        messages: [
          {
            role: 'user',
            content: 'Say "Hello from OpenRouter!" in exactly 4 words.',
          },
        ],
        max_tokens: 50,
        temperature: 0,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ API request failed:', response.status, response.statusText);
      console.error('Response:', errorText);
      
      if (response.status === 401) {
        console.log('\n💡 Tip: Make sure your OPENROUTER_API_KEY is valid.');
        console.log('Get your API key from: https://openrouter.ai/keys');
      }
      
      process.exit(1);
    }

    const data = await response.json();
    
    console.log('✅ Connection successful!');
    console.log('');
    console.log('📊 Response details:');
    console.log(`- Model: ${data.model || 'N/A'}`);
    console.log(`- Usage: ${data.usage?.total_tokens || 'N/A'} tokens`);
    console.log(`- Response: ${data.choices?.[0]?.message?.content || 'No response'}`);
    console.log('');
    console.log('🎉 OpenRouter is configured correctly!');
    console.log('');
    console.log('📝 Next steps:');
    console.log('1. Start your development server: bun run dev');
    console.log('2. The Inngest functions will now use OpenRouter');
    console.log('3. Monitor your usage at: https://openrouter.ai/activity');

  } catch (error) {
    console.error('❌ Error testing OpenRouter:');
    console.error(error.message);
    
    if (error.code === 'ENOTFOUND') {
      console.log('\n💡 Tip: Check your internet connection and the base URL.');
    }
    
    process.exit(1);
  }
}

// Run the test
testOpenRouter().catch(console.error);

