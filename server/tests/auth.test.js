// file: server/tests/auth.test.js

const request = require('supertest');
const express = require('express');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const jwt = require('jsonwebtoken');

let mongoServer;
let app;
let User;

// Define User schema (matching your actual model)
const userSchema = new mongoose.Schema({
  username: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, default: 'member' },
  firebaseUid: String,
  resetToken: String,
  resetTokenExpiry: Date,
});

// Add matchPassword method
userSchema.methods.matchPassword = async function(password) {
  // Simple comparison for testing
  return this.password === password;
};

// Add pre-save hook for password hashing (simplified for tests)
userSchema.pre('save', function(next) {
  if (!this.isModified('password')) return next();
  // Don't actually hash in tests - just mark as modified
  next();
});

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const mongoUri = mongoServer.getUri();
  
  // Set environment variables BEFORE any imports
  process.env.JWT_SECRET = 'test-secret-key';
  process.env.CLIENT_URL = 'http://localhost:5173';
  
  await mongoose.connect(mongoUri);
  
  // Register User model
  User = mongoose.model('User', userSchema);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(async () => {
  // Clear database
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    await collections[key].deleteMany({});
  }
  
  // Create test user for login tests
  await User.create({
    username: 'loginuser',
    email: 'login@test.com',
    password: 'correctpassword',
    role: 'member',
  });
  
  // Set up Express app
  app = express();
  app.use(express.json());
  
  // Use actual auth routes
  const authRoutes = require('../routes/authRoutes');
  app.use('/api/auth', authRoutes);
});

describe('Auth Routes', () => {
  describe('POST /api/auth/register', () => {
    it('should register a new user successfully', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          username: 'thabo123',
          email: 'thabo@test.com',
          password: '123456',
        });

      // If still getting 400, log the error
      if (response.status !== 201) {
        console.log('Register response:', response.body);
      }
      
      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('username', 'thabo123');
      expect(response.body).not.toHaveProperty('password');
    });

    it('should reject duplicate email', async () => {
      // First registration
      await request(app)
        .post('/api/auth/register')
        .send({
          username: 'user1',
          email: 'duplicate@test.com',
          password: '123456',
        });

      // Second registration with same email
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          username: 'user2',
          email: 'duplicate@test.com',
          password: '123456',
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('already exists');
    });

    it('should reject missing required fields', async () => {
      const testCases = [
        { username: 'test' },
        { email: 'test@test.com' },
        { password: '123456' },
        {},
      ];

      for (const testCase of testCases) {
        const response = await request(app)
          .post('/api/auth/register')
          .send(testCase);

        expect(response.status).toBe(400);
        expect(response.body).toHaveProperty('error');
      }
    });

    it('should reject short password', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          username: 'testuser',
          email: 'test@test.com',
          password: '123', // Too short
        });

      expect(response.status).toBe(400);
    });
  });

  describe('POST /api/auth/login', () => {
    it('should login successfully with correct credentials', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'login@test.com',
          password: 'correctpassword',
        });

      // Debug if failing
      if (response.status !== 200) {
        console.log('Login response:', response.body);
      }

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('token');
      expect(response.body).toHaveProperty('email', 'login@test.com');
    });

    it('should fail if password is incorrect', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'login@test.com',
          password: 'wrongpassword',
        });

      expect(response.status).toBe(401);
    });

    it('should return valid JWT token', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'login@test.com',
          password: 'correctpassword',
        });

      expect(response.status).toBe(200);
      expect(response.body.token).toBeDefined();

      // ✅ Use the same secret as the app
      const decoded = jwt.verify(response.body.token, process.env.JWT_SECRET);
      expect(decoded).toHaveProperty('id');
      expect(decoded).toHaveProperty('role');
    });

    it('should reject non-existent user', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'nonexistent@test.com',
          password: 'password',
        });

      expect(response.status).toBe(401);
    });

    it('should reject missing email or password', async () => {
      const testCases = [
        { email: 'test@test.com' },
        { password: 'password' },
        {},
      ];

      for (const testCase of testCases) {
        const response = await request(app)
          .post('/api/auth/login')
          .send(testCase);

        expect(response.status).toBe(400);
      }
    });
  });
});