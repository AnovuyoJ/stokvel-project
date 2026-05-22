process.env.JWT_SECRET = 'test-secret';
const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const UserModel = require('../../server/models/users');
const Member = require('../../server/models/member');
const admin = require('../../server/firebaseAdmin');
const authController = require('../../server/controllers/authController');

// Mock dependencies
jest.mock('../../server/models/users');
jest.mock('../../server/models/member');
jest.mock('../../server/firebaseAdmin');
jest.mock('jsonwebtoken');
jest.mock('crypto');

// Create express app for testing
const app = express();
app.use(express.json());

// Setup routes
app.post('/api/auth/register', authController.registerUser);
app.post('/api/auth/login', authController.loginUser);
app.post('/api/auth/google', authController.AuthenticateWithGoogle);
app.post('/api/auth/forgot-password', authController.forgotPassword);
app.post('/api/auth/reset-password', authController.resetPassword);

describe('Auth Controller', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('registerUser', () => {
    const validUser = {
      username: 'testuser',
      email: 'test@example.com',
      password: 'password123'
    };

    const mockSavedUser = {
      _id: '123456',
      username: 'testuser',
      email: 'test@example.com',
      role: 'member',
      _doc: {
        username: 'testuser',
        email: 'test@example.com',
        role: 'member',
        _id: '123456'
      }
    };

    it('should register a new user successfully', async () => {
      UserModel.create.mockResolvedValue(mockSavedUser);
      Member.updateMany.mockResolvedValue({ modifiedCount: 0 });

      const response = await request(app)
        .post('/api/auth/register')
        .send(validUser);

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('username', 'testuser');
      expect(response.body).toHaveProperty('email', 'test@example.com');
      expect(response.body).not.toHaveProperty('password');
      expect(UserModel.create).toHaveBeenCalledWith({
        username: validUser.username,
        email: validUser.email,
        password: validUser.password
      });
    });

    it('should return 400 if required fields are missing', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({ username: 'testuser' });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('All fields are required');
      expect(UserModel.create).not.toHaveBeenCalled();
    });

    it('should return 400 if user already exists (duplicate key)', async () => {
      const duplicateError = new Error('Duplicate key');
      duplicateError.code = 11000;
      UserModel.create.mockRejectedValue(duplicateError);

      const response = await request(app)
        .post('/api/auth/register')
        .send(validUser);

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('This user already exists');
    });

    it('should handle other errors', async () => {
      UserModel.create.mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .post('/api/auth/register')
        .send(validUser);

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Database error');
    });
  });

  describe('loginUser', () => {
    const validCredentials = {
      email: 'test@example.com',
      password: 'password123'
    };

    const mockUser = {
      _id: '123456',
      email: 'test@example.com',
      username: 'testuser',
      role: 'member',
      matchPassword: jest.fn(),
      save: jest.fn()
    };

    beforeEach(() => {
      mockUser.matchPassword.mockReset();
    });

    it('should login user successfully with valid credentials', async () => {
      mockUser.matchPassword.mockResolvedValue(true);
      UserModel.findOne.mockResolvedValue(mockUser);
      Member.updateMany.mockResolvedValue({ modifiedCount: 0 });
      jwt.sign.mockReturnValue('fake-jwt-token');

      const response = await request(app)
        .post('/api/auth/login')
        .send(validCredentials);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('token', 'fake-jwt-token');
      expect(response.body).toHaveProperty('email', 'test@example.com');
      expect(response.body).toHaveProperty('username', 'testuser');
      expect(response.body).toHaveProperty('role', 'member');
      expect(jwt.sign).toHaveBeenCalledWith(
        { id: mockUser._id, role: mockUser.role },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
      );
    });

    it('should return 400 if email or password is missing', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({ email: 'test@example.com' });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Please fill in all required fields');
    });

    it('should return 401 if user not found', async () => {
      UserModel.findOne.mockResolvedValue(null);

      const response = await request(app)
        .post('/api/auth/login')
        .send(validCredentials);

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('User not found');
    });

    it('should return 401 if password is incorrect', async () => {
      mockUser.matchPassword.mockResolvedValue(false);
      UserModel.findOne.mockResolvedValue(mockUser);

      const response = await request(app)
        .post('/api/auth/login')
        .send(validCredentials);

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('Password is incorrect');
    });

    it('should handle errors', async () => {
      UserModel.findOne.mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .post('/api/auth/login')
        .send(validCredentials);

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Database error');
    });
  });

  describe('AuthenticateWithGoogle', () => {
    const validToken = 'google-id-token';
    const mockDecodedToken = {
      email: 'google@example.com',
      name: 'Google User',
      uid: 'google-uid-123'
    };

    const mockExistingUser = {
      _id: '123456',
      email: 'google@example.com',
      username: 'Google User',
      role: 'member',
      firebaseUid: null,
      save: jest.fn()
    };

    const mockNewUser = {
      _id: '789012',
      email: 'google@example.com',
      username: 'Google User',
      role: 'member',
      firebaseUid: 'google-uid-123',
      _doc: {}
    };

    beforeEach(() => {
      mockExistingUser.save.mockResolvedValue(mockExistingUser);
    });

    it('should authenticate existing user with Google', async () => {
      admin.auth().verifyIdToken.mockResolvedValue(mockDecodedToken);
      UserModel.findOne.mockResolvedValue(mockExistingUser);
      jwt.sign.mockReturnValue('fake-jwt-token');

      const response = await request(app)
        .post('/api/auth/google')
        .send({ idToken: validToken });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('token', 'fake-jwt-token');
      expect(response.body).toHaveProperty('email', 'google@example.com');
      expect(admin.auth().verifyIdToken).toHaveBeenCalledWith(validToken);
    });

    it('should create new user if not exists with Google', async () => {
      admin.auth().verifyIdToken.mockResolvedValue(mockDecodedToken);
      UserModel.findOne.mockResolvedValue(null);
      UserModel.create.mockResolvedValue(mockNewUser);
      jwt.sign.mockReturnValue('fake-jwt-token');

      const response = await request(app)
        .post('/api/auth/google')
        .send({ idToken: validToken });

      expect(response.status).toBe(200);
      expect(UserModel.create).toHaveBeenCalledWith({
        username: 'Google User',
        email: 'google@example.com',
        password: 'google-uid-123',
        firebaseUid: 'google-uid-123'
      });
    });

    it('should update firebaseUid for existing user without it', async () => {
      admin.auth().verifyIdToken.mockResolvedValue(mockDecodedToken);
      UserModel.findOne.mockResolvedValue(mockExistingUser);
      jwt.sign.mockReturnValue('fake-jwt-token');

      const response = await request(app)
        .post('/api/auth/google')
        .send({ idToken: validToken });

      expect(response.status).toBe(200);
      expect(mockExistingUser.firebaseUid).toBe('google-uid-123');
      expect(mockExistingUser.save).toHaveBeenCalled();
    });

    it('should return 400 if idToken is missing', async () => {
      const response = await request(app)
        .post('/api/auth/google')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid Google token');
    });

    it('should return 400 if Google token verification fails', async () => {
      admin.auth().verifyIdToken.mockRejectedValue(new Error('Invalid token'));

      const response = await request(app)
        .post('/api/auth/google')
        .send({ idToken: validToken });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid Google token');
    });
  });

  describe('forgotPassword', () => {
    const validEmail = { email: 'test@example.com' };
    const mockUser = {
      _id: '123456',
      email: 'test@example.com',
      resetToken: null,
      resetTokenExpiry: null,
      save: jest.fn()
    };

    beforeEach(() => {
      crypto.randomBytes.mockReturnValue({
        toString: jest.fn().mockReturnValue('reset-token-123')
      });
      Date.now = jest.fn().mockReturnValue(1000000);
    });

    it('should generate reset token for valid email', async () => {
      UserModel.findOne.mockResolvedValue(mockUser);
      mockUser.save.mockResolvedValue(mockUser);

      const response = await request(app)
        .post('/api/auth/forgot-password')
        .send(validEmail);

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Password reset link generated');
      expect(response.body.link).toContain('reset-token-123');
      expect(mockUser.resetToken).toBe('reset-token-123');
      expect(mockUser.resetTokenExpiry).toBe(1000000 + 3600000);
    });

    it('should return 400 if email is missing', async () => {
      const response = await request(app)
        .post('/api/auth/forgot-password')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Email is required');
    });

    it('should return 404 if user not found', async () => {
      UserModel.findOne.mockResolvedValue(null);

      const response = await request(app)
        .post('/api/auth/forgot-password')
        .send(validEmail);

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('No account found with this email');
    });

    it('should handle errors', async () => {
      UserModel.findOne.mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .post('/api/auth/forgot-password')
        .send(validEmail);

      expect(response.status).toBe(500);
      expect(response.body.error).toBe('Database error');
    });
  });

  describe('resetPassword', () => {
    const validResetData = {
      email: 'test@example.com',
      token: 'valid-token',
      newPassword: 'newpassword123'
    };

    const mockUser = {
      _id: '123456',
      email: 'test@example.com',
      resetToken: 'valid-token',
      resetTokenExpiry: Date.now() + 3600000,
      password: 'oldpassword',
      save: jest.fn()
    };

    it('should reset password successfully', async () => {
      UserModel.findOne.mockResolvedValue(mockUser);
      mockUser.save.mockResolvedValue(mockUser);

      const response = await request(app)
        .post('/api/auth/reset-password')
        .send(validResetData);

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Password reset successful');
      expect(mockUser.password).toBe('newpassword123');
      expect(mockUser.resetToken).toBeUndefined();
      expect(mockUser.resetTokenExpiry).toBeUndefined();
    });

    it('should return 400 if required fields are missing', async () => {
      const response = await request(app)
        .post('/api/auth/reset-password')
        .send({ email: 'test@example.com' });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('All fields are required');
    });

    it('should return 400 if password is too short', async () => {
      const response = await request(app)
        .post('/api/auth/reset-password')
        .send({
          email: 'test@example.com',
          token: 'token',
          newPassword: '123'
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Password must be at least 6 characters');
    });

    it('should return 400 if token is invalid or expired', async () => {
      UserModel.findOne.mockResolvedValue(null);

      const response = await request(app)
        .post('/api/auth/reset-password')
        .send(validResetData);

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid or expired token');
    });

    it('should handle errors', async () => {
      UserModel.findOne.mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .post('/api/auth/reset-password')
        .send(validResetData);

      expect(response.status).toBe(500);
      expect(response.body.error).toBe('Database error');
    });
  });
});