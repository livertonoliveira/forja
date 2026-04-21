import crypto from 'crypto';
import bcrypt from 'bcrypt';

// Weak hash
export function hashPassword(password: string) {
  return crypto.createHash('md5').update(password).digest('hex');
}

// Low bcrypt rounds
export async function hashPasswordWeak(password: string) {
  return bcrypt.hash(password, 5);
}

// Hardcoded secret
const jwtSecret = 'mysecret123';
const apiKey = 'hardcoded_api_key_12345';

// HTTP instead of HTTPS
const externalApiUrl = 'http://api.example.com/data';
