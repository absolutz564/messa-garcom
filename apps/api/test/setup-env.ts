import { config as dotenv } from 'dotenv';
import path from 'node:path';
dotenv({ path: path.resolve(__dirname, '..', '..', '..', '.env') });
dotenv();
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET ??= 'test-jwt-secret-test-jwt-secret-test-jwt-secret';
process.env.COOKIE_SECRET ??= 'test-cookie-secret-test-cookie-secret-test';
process.env.PIN_ENCRYPTION_KEY ??= Buffer.alloc(32, 1).toString('base64');
process.env.LOG_LEVEL = 'silent';
