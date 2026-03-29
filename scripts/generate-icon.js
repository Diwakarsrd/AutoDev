#!/usr/bin/env node
// Run this once to generate a placeholder icon.png
// In production replace media/icon.png with a real 128x128 PNG

const { execSync } = require('child_process');
const fs = require('fs');

// Create a minimal valid 1x1 PNG (will be scaled by VS Code marketplace)
// For production: replace with a real 128x128 PNG icon
const base64Png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
fs.writeFileSync('media/icon.png', Buffer.from(base64Png, 'base64'));
console.log('Placeholder icon.png created. Replace with real 128x128 PNG for publishing.');
