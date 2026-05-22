// file: server/tests/memberRoutes.test.js

const request = require('supertest');
const express = require('express');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const jwt = require('jsonwebtoken');

// We'll use the actual routes but with a test database
let mongoServer;
let app;
let Group, Member, User;

// Test data
const testUserId = new mongoose.Types.ObjectId();
const testGroupId = new mongoose.Types.ObjectId();
const testMemberId = new mongoose.Types.ObjectId();

// Create models inline for testing (same as your actual models)
const groupSchema = new mongoose.Schema({
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  name: { type: String, required: true },
  amount: Number,
  freq: String,
  cycle: String,
  max: Number,
}, { timestamps: true });

const memberSchema = new mongoose.Schema({
  group: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', required: true },
  name: { type: String, required: true },
  contact: { type: String, required: true },
  role: { type: String, enum: ['Admin', 'Treasurer', 'Member'], default: 'Member' },
  status: { type: String, enum: ['pending', 'active', 'inactive'], default: 'pending' },
  initials: String,
  slot: { type: Number, default: 0 },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  contributions: [{
    month: String,
    amount: Number,
    status: { type: String, enum: ['paid', 'missed', 'overdue'], default: 'missed' },
    paidAt: Date,
  }],
}, { timestamps: true });

const contributionSchema = new mongoose.Schema({
  group: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', required: true },
  member: { type: mongoose.Schema.Types.ObjectId, ref: 'Member', required: true },
  amount: Number,
  month: String,
  status: { type: String, enum: ['pending', 'paid', 'failed', 'missed'], default: 'pending' },
  reference: String,
}, { timestamps: true });

const userSchema = new mongoose.Schema({
  username: String,
  email: { type: String, required: true },
  password: String,
  role: { type: String, default: 'member' },
});

// Generate valid JWT token
function generateToken(userId = testUserId.toString()) {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET || 'test-secret', { expiresIn: '1h' });
}

beforeAll(async () => {
  // Set up MongoDB Memory Server
  mongoServer = await MongoMemoryServer.create();
  const mongoUri = mongoServer.getUri();
  
  process.env.JWT_SECRET = 'test-secret';
  process.env.CLIENT_URL = 'http://localhost:5173';
  
  await mongoose.connect(mongoUri);
  
  // Register models
  User = mongoose.model('User', userSchema);
  Group = mongoose.model('Group', groupSchema);
  Member = mongoose.model('Member', memberSchema);
  mongoose.model('Contribution', contributionSchema);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(async () => {
  // Clear all collections before each test
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    await collections[key].deleteMany({});
  }
  
  // Create test user
  await User.create({
    _id: testUserId,
    username: 'testuser',
    email: 'testuser@example.com',
    password: 'hashedpassword',
    role: 'member',
  });
  
  // Create test group
  await Group.create({
    _id: testGroupId,
    owner: testUserId,
    name: 'Test Stokvel Group',
    amount: 250,
    freq: 'Monthly',
  });
  
  // Create test member
  await Member.create({
    _id: testMemberId,
    group: testGroupId,
    name: 'John Doe',
    contact: 'john@example.com',
    role: 'Member',
    status: 'active',
    initials: 'JD',
    slot: 1,
  });
  
  // Set up Express app with real routes
  app = express();
  app.use(express.json());
  
  // Use the actual member routes
  const memberRoutes = require('../routes/memberRoutes');
  app.use('/api', memberRoutes);
});

describe('Member Routes - Integration Tests', () => {
  describe('GET /api/members', () => {
    it('should return members for a group when user is owner', async () => {
      const token = generateToken();
      
      const response = await request(app)
        .get('/api/members')
        .query({ groupId: testGroupId.toString() })
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThan(0);
      expect(response.body[0].name).toBe('John Doe');
    });

    it('should return members when user is an active member', async () => {
      // Create another user who is a member
      const otherUserId = new mongoose.Types.ObjectId();
      await User.create({
        _id: otherUserId,
        username: 'otheruser',
        email: 'other@example.com',
        password: 'password',
      });
      
      // Add them as a member
      await Member.create({
        group: testGroupId,
        name: 'Other Member',
        contact: 'other@example.com',
        role: 'Member',
        status: 'active',
        userId: otherUserId,
      });

      const token = generateToken(otherUserId.toString());
      
      const response = await request(app)
        .get('/api/members')
        .query({ groupId: testGroupId.toString() })
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.length).toBe(2);
    });

    it('should return 400 when groupId is missing', async () => {
      const token = generateToken();
      
      const response = await request(app)
        .get('/api/members')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('groupId required');
    });

    it('should return 404 when group does not exist', async () => {
      const token = generateToken();
      const fakeGroupId = new mongoose.Types.ObjectId();
      
      const response = await request(app)
        .get('/api/members')
        .query({ groupId: fakeGroupId.toString() })
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Group not found');
    });

    it('should return 403 when user is not a member', async () => {
      // Create a group owned by someone else
      const otherUserId = new mongoose.Types.ObjectId();
      const otherGroupId = new mongoose.Types.ObjectId();
      
      await User.create({
        _id: otherUserId,
        username: 'owner',
        email: 'owner@example.com',
        password: 'password',
      });
      
      await Group.create({
        _id: otherGroupId,
        owner: otherUserId,
        name: 'Private Group',
        amount: 500,
      });

      const token = generateToken();
      
      const response = await request(app)
        .get('/api/members')
        .query({ groupId: otherGroupId.toString() })
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(403);
      expect(response.body.error).toBe('Access denied');
    });

    it('should return 401 when no token provided', async () => {
      const response = await request(app)
        .get('/api/members')
        .query({ groupId: testGroupId.toString() });

      expect(response.status).toBe(401);
    });
  });

  describe('POST /api/members', () => {
    it('should invite a new member when user is owner', async () => {
      const token = generateToken();
      
      const response = await request(app)
        .post('/api/members')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'Jane Smith',
          contact: 'jane@example.com',
          groupId: testGroupId.toString(),
        });

      expect(response.status).toBe(201);
      expect(response.body.name).toBe('Jane Smith');
      expect(response.body.contact).toBe('jane@example.com');
      expect(response.body.initials).toBe('JS');
      expect(response.body.role).toBe('Member');
      expect(response.body.status).toBe('active');
    });

    it('should generate correct initials', async () => {
      const token = generateToken();
      
      const testCases = [
        { name: 'John Doe', expected: 'JD' },
        { name: 'Mary Jane Smith', expected: 'MJ' },
        { name: 'A B C D', expected: 'AB' },
        { name: 'Single', expected: 'S' },
      ];

      for (const testCase of testCases) {
        await Member.deleteMany({ contact: `test-${testCase.name}@example.com` });
        
        const response = await request(app)
          .post('/api/members')
          .set('Authorization', `Bearer ${token}`)
          .send({
            name: testCase.name,
            contact: `test-${testCase.name}@example.com`,
            groupId: testGroupId.toString(),
          });

        expect(response.status).toBe(201);
        expect(response.body.initials).toBe(testCase.expected);
      }
    });

    it('should return 409 when contact is already a member', async () => {
      const token = generateToken();
      
      const response = await request(app)
        .post('/api/members')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'Duplicate',
          contact: 'john@example.com', // Already exists
          groupId: testGroupId.toString(),
        });

      expect(response.status).toBe(409);
      expect(response.body.error).toContain('already a member');
    });

    it('should return 400 when required fields are missing', async () => {
      const token = generateToken();
      
      const testCases = [
        { name: 'Jane' }, // Missing contact and groupId
        { contact: 'jane@example.com' }, // Missing name and groupId
        { groupId: testGroupId.toString() }, // Missing name and contact
        {}, // All missing
      ];

      for (const testCase of testCases) {
        const response = await request(app)
          .post('/api/members')
          .set('Authorization', `Bearer ${token}`)
          .send(testCase);

        expect(response.status).toBe(400);
        expect(response.body.error).toBe('name, contact, and groupId required');
      }
    });

    it('should convert contact email to lowercase', async () => {
      const token = generateToken();
      
      const response = await request(app)
        .post('/api/members')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'Case Test',
          contact: 'UPPERCASE@Example.COM',
          groupId: testGroupId.toString(),
        });

      expect(response.status).toBe(201);
      expect(response.body.contact).toBe('uppercase@example.com');
    });

    it('should return 404 when group does not exist', async () => {
      const token = generateToken();
      const fakeGroupId = new mongoose.Types.ObjectId();
      
      const response = await request(app)
        .post('/api/members')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'Jane',
          contact: 'jane@example.com',
          groupId: fakeGroupId.toString(),
        });

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Group not found');
    });
  });

  describe('PATCH /api/members/:id/role', () => {
    it('should change member role when user is owner', async () => {
      const token = generateToken();
      
      const response = await request(app)
        .patch(`/api/members/${testMemberId}/role`)
        .set('Authorization', `Bearer ${token}`)
        .send({ role: 'Treasurer' });

      expect(response.status).toBe(200);
      expect(response.body.role).toBe('Treasurer');
    });

    it('should accept all valid roles', async () => {
      const token = generateToken();
      const validRoles = ['Admin', 'Treasurer', 'Member'];

      for (const role of validRoles) {
        // Reset role to Member before each test
        await Member.findByIdAndUpdate(testMemberId, { role: 'Member' });
        
        const response = await request(app)
          .patch(`/api/members/${testMemberId}/role`)
          .set('Authorization', `Bearer ${token}`)
          .send({ role });

        expect(response.status).toBe(200);
        expect(response.body.role).toBe(role);
      }
    });

    it('should return 400 for invalid roles', async () => {
        const token = generateToken();
        
        // Only test non-empty invalid roles
        const invalidRoles = ['SuperAdmin', 'Moderator', 'admin', 'treasurer'];

        for (const role of invalidRoles) {
            await Member.findByIdAndUpdate(testMemberId, { role: 'Member' });
            
            const response = await request(app)
            .patch(`/api/members/${testMemberId}/role`)
            .set('Authorization', `Bearer ${token}`)
            .send({ role });

            expect(response.status).toBe(400);
            expect(response.body.error).toContain('Role must be one of');
        }
        });

    it('should return 400 when role is missing', async () => {
      const token = generateToken();
      
      const response = await request(app)
        .patch(`/api/members/${testMemberId}/role`)
        .set('Authorization', `Bearer ${token}`)
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('role required');
    });

    it('should return 404 when member not found', async () => {
      const token = generateToken();
      const fakeMemberId = new mongoose.Types.ObjectId();
      
      const response = await request(app)
        .patch(`/api/members/${fakeMemberId}/role`)
        .set('Authorization', `Bearer ${token}`)
        .send({ role: 'Treasurer' });

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Member not found');
    });
  });

  describe('PUT /api/members/reorder', () => {
    it('should reorder members successfully', async () => {
      // Create additional members
      const member2 = await Member.create({
        group: testGroupId,
        name: 'Member Two',
        contact: 'member2@example.com',
        role: 'Member',
        status: 'active',
        slot: 2,
      });
      
      const member3 = await Member.create({
        group: testGroupId,
        name: 'Member Three',
        contact: 'member3@example.com',
        role: 'Member',
        status: 'active',
        slot: 3,
      });

      const token = generateToken();
      
      const response = await request(app)
        .put('/api/members/reorder')
        .set('Authorization', `Bearer ${token}`)
        .send({
          order: [
            { id: member3._id.toString(), slot: 1 },
            { id: testMemberId.toString(), slot: 2 },
            { id: member2._id.toString(), slot: 3 },
          ]
        });

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Order saved');
      
      // Verify order was updated
      const updatedMember = await Member.findById(testMemberId);
      expect(updatedMember.slot).toBe(2);
    });

    it('should return 400 when order is not an array', async () => {
      const token = generateToken();
      
      const testCases = [
        { order: 'string' },
        { order: 123 },
        { order: null },
        {},
      ];

      for (const testCase of testCases) {
        const response = await request(app)
          .put('/api/members/reorder')
          .set('Authorization', `Bearer ${token}`)
          .send(testCase);

        expect(response.status).toBe(400);
        expect(response.body.error).toBe('order array required');
      }
    });

    it('should handle empty order array', async () => {
      const token = generateToken();
      
      const response = await request(app)
        .put('/api/members/reorder')
        .set('Authorization', `Bearer ${token}`)
        .send({ order: [] });

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Order saved');
    });
  });

  describe('POST /api/groups/:groupId/flag-payment', () => {
    it('should flag a member payment as missed', async () => {
      const token = generateToken();
      
      const response = await request(app)
        .post(`/api/groups/${testGroupId}/flag-payment`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          memberId: testMemberId.toString(),
          status: 'missed',
        });

      expect(response.status).toBe(200);
      expect(response.body.message).toContain('flagged as missed');
      expect(response.body.message).toContain('John Doe');
    });

    it('should create a contribution record when flagging', async () => {
      const token = generateToken();
      
      await request(app)
        .post(`/api/groups/${testGroupId}/flag-payment`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          memberId: testMemberId.toString(),
          status: 'missed',
        });

      // Check contribution was created
      const Contribution = mongoose.model('Contribution');
      const contributions = await Contribution.find({ member: testMemberId });
      expect(contributions.length).toBe(1);
      expect(contributions[0].status).toBe('missed');
      expect(contributions[0].amount).toBe(250);
    });

    it('should update existing contribution if found', async () => {
      const token = generateToken();
      const Contribution = mongoose.model('Contribution');
      
      // Create existing contribution
      await Contribution.create({
        group: testGroupId,
        member: testMemberId,
        amount: 250,
        month: `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`,
        status: 'pending',
        reference: 'TEST-REF',
      });
      
      const response = await request(app)
        .post(`/api/groups/${testGroupId}/flag-payment`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          memberId: testMemberId.toString(),
          status: 'paid',
        });

      expect(response.status).toBe(200);
      
      // Check contribution was updated
      const contributions = await Contribution.find({ member: testMemberId });
      expect(contributions.length).toBe(1); // Should not create duplicate
      expect(contributions[0].status).toBe('paid');
    });

    it('should return 400 when memberId is missing', async () => {
      const token = generateToken();
      
      const response = await request(app)
        .post(`/api/groups/${testGroupId}/flag-payment`)
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'missed' });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('memberId required');
    });

    it('should return 404 when member not found', async () => {
      const token = generateToken();
      const fakeMemberId = new mongoose.Types.ObjectId();
      
      const response = await request(app)
        .post(`/api/groups/${testGroupId}/flag-payment`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          memberId: fakeMemberId.toString(),
          status: 'missed',
        });

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Member not found');
    });

    it('should return 404 when group not found', async () => {
      const token = generateToken();
      const fakeGroupId = new mongoose.Types.ObjectId();
      
      const response = await request(app)
        .post(`/api/groups/${fakeGroupId}/flag-payment`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          memberId: testMemberId.toString(),
          status: 'missed',
        });

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Group not found');
    });
  });
});