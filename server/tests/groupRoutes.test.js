// file: server/tests/groupRoutes.test.js

// Mock mongoose models BEFORE requiring the routes
beforeAll(async () => {
  process.env.JWT_SECRET = 'test-secret-key';  // Must be first
  mongoServer = await MongoMemoryServer.create();
  // ... rest
});

function generateToken(userId = testUserId.toString()) {
  return jwt.sign(
    { id: userId, role: 'member' },
    process.env.JWT_SECRET,  // Same secret
    { expiresIn: '1h' }
  );
}
const mockGroupFindById = jest.fn();
const mockGroupFind = jest.fn();
const mockGroupFindOne = jest.fn();
const mockGroupFindOneAndUpdate = jest.fn();
const mockGroupFindOneAndDelete = jest.fn();
const mockGroupCreate = jest.fn();

const mockMemberFindById = jest.fn();
const mockMemberFind = jest.fn();
const mockMemberFindOne = jest.fn();
const mockMemberCreate = jest.fn();
const mockMemberCountDocuments = jest.fn();
const mockMemberUpdateMany = jest.fn();
const mockMemberFindByIdAndUpdate = jest.fn();
const mockMemberDeleteMany = jest.fn();
const mockMemberDeleteOne = jest.fn();

const mockMeetingFindById = jest.fn();
const mockMeetingFind = jest.fn();
const mockMeetingCreate = jest.fn();
const mockMeetingDeleteMany = jest.fn();

const mockUserFindById = jest.fn();
const mockUserFindOne = jest.fn();

const mockNotificationCreate = jest.fn();

// Mock mongoose
jest.mock('mongoose', () => {
  const actualMongoose = jest.requireActual('mongoose');
  return {
    ...actualMongoose,
    model: jest.fn().mockImplementation((name, schema) => {
      const mockModel = function(data) {
        if (data) Object.assign(this, data);
        this.save = jest.fn().mockResolvedValue(this);
        this.toObject = jest.fn().mockReturnValue({ ...this });
        this.deleteOne = jest.fn().mockResolvedValue({});
        this.populate = jest.fn().mockReturnThis();
      };
      mockModel.findById = mockGroupFindById;
      mockModel.find = mockGroupFind;
      mockModel.findOne = mockGroupFindOne;
      mockModel.findOneAndUpdate = mockGroupFindOneAndUpdate;
      mockModel.findOneAndDelete = mockGroupFindOneAndDelete;
      mockModel.create = mockGroupCreate;
      mockModel.findByIdAndUpdate = mockMemberFindByIdAndUpdate;
      mockModel.deleteMany = mockMemberDeleteMany;
      mockModel.countDocuments = mockMemberCountDocuments;
      mockModel.updateMany = mockMemberUpdateMany;
      mockModel.prototype.save = jest.fn().mockResolvedValue({});
      mockModel.prototype.populate = jest.fn().mockReturnThis();
      return mockModel;
    }),
    models: {
      User: {
        findById: mockUserFindById,
        findOne: mockUserFindOne,
      },
      Notification: {
        create: mockNotificationCreate,
      }
    },
    Schema: actualMongoose.Schema,
    Types: actualMongoose.Types,
    connect: jest.fn(),
    connection: { close: jest.fn() },
  };
});

// Mock email service
jest.mock('../services/emailService', () => ({
  sendInviteEmail: jest.fn().mockResolvedValue(true),
  sendMeetingNotification: jest.fn().mockResolvedValue(true),
  sendMissingContributionEmail: jest.fn().mockResolvedValue(true),
  sendMeetingMinutes: jest.fn().mockResolvedValue(true),
  sendRoleAssignedEmail: jest.fn().mockResolvedValue(true),
}));

// Mock users model
jest.mock('../models/users', () => {
  return jest.fn().mockImplementation(function(data) {
    Object.assign(this, data);
    this.save = jest.fn().mockResolvedValue(this);
  });
});

// Now require the dependencies
const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const User = require('../models/users');
const { 
  sendInviteEmail, 
  sendMeetingNotification, 
  sendMissingContributionEmail,
  sendMeetingMinutes,
  sendRoleAssignedEmail 
} = require('../services/emailService');

// Mock jwt verify
jest.mock('jsonwebtoken', () => ({
  verify: jest.fn().mockReturnValue({ id: 'test-user-id' }),
  sign: jest.fn().mockReturnValue('mock-token'),
}));

// Import routes after all mocks
const groupRoutes = require('../routes/groupRoutes');

describe('Group Routes', () => {
  let app;
  const testUserId = '507f1f77bcf86cd799439011';
  const testGroupId = '507f1f77bcf86cd799439022';
  const testMemberId = '507f1f77bcf86cd799439033';
  const testMeetingId = '507f1f77bcf86cd799439044';

  const mockGroup = {
    _id: testGroupId,
    owner: testUserId,
    name: 'Test Group',
    amount: 250,
    freq: 'Monthly',
    nextPayoutIndex: 0,
    save: jest.fn().mockResolvedValue(true),
  };

  const mockMember = {
    _id: testMemberId,
    group: testGroupId,
    name: 'John Doe',
    contact: 'john@example.com',
    role: 'Member',
    status: 'active',
    slot: 1,
    contributions: [],
    save: jest.fn().mockResolvedValue(true),
    toObject: jest.fn().mockReturnValue({
      _id: testMemberId,
      name: 'John Doe',
      contact: 'john@example.com',
      role: 'Member',
    }),
    deleteOne: jest.fn().mockResolvedValue({}),
  };

  const mockUser = {
    _id: testUserId,
    email: 'admin@example.com',
    username: 'admin',
    name: 'Admin User',
  };

  beforeEach(() => {
    app = express();
    app.use(express.json());
    
    // Mock auth middleware
    app.use((req, res, next) => {
      req.userId = testUserId;
      next();
    });
    
    app.use('/api', groupRoutes);
    
    // Reset all mocks
    jest.clearAllMocks();
    
    // Setup default mock implementations
    mockUserFindById.mockResolvedValue(mockUser);
    mockGroupFindById.mockResolvedValue(mockGroup);
    mockGroupFindOne.mockResolvedValue(mockGroup);
    mockMemberFindOne.mockResolvedValue(mockMember);
    mockMemberFind.mockResolvedValue([mockMember]);
    mockMemberCountDocuments.mockResolvedValue(1);
    mockMeetingFind.mockResolvedValue([]);
  });

  describe('POST /api/group', () => {
    it('should create a new group successfully', async () => {
      mockGroupCreate.mockResolvedValue(mockGroup);
      User.findById = mockUserFindById;

      const response = await request(app)
        .post('/api/group')
        .send({
          name: 'New Group',
          amount: 500,
          freq: 'Monthly',
        });

      expect(response.status).toBe(201);
      expect(response.body.name).toBe('Test Group');
    });

    it('should return 400 if group name is missing', async () => {
      const response = await request(app)
        .post('/api/group')
        .send({
          amount: 500,
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Group name is required');
    });

    it('should return 500 on database error', async () => {
      mockGroupCreate.mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .post('/api/group')
        .send({
          name: 'New Group',
          amount: 500,
        });

      expect(response.status).toBe(500);
    });
  });

  describe('GET /api/groups', () => {
    it('should return owned and member groups', async () => {
      mockGroupFind.mockResolvedValue([mockGroup]);
      mockMemberFind.mockResolvedValue([{
        group: mockGroup,
        status: 'active',
      }]);

      const response = await request(app)
        .get('/api/groups');

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
    });

    it('should return 500 on database error', async () => {
      mockGroupFind.mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .get('/api/groups');

      expect(response.status).toBe(500);
    });
  });

  describe('PATCH /api/group/:id', () => {
    it('should update a group successfully', async () => {
      mockGroupFindOneAndUpdate.mockResolvedValue({
        ...mockGroup,
        name: 'Updated Group',
      });

      const response = await request(app)
        .patch(`/api/group/${testGroupId}`)
        .send({ name: 'Updated Group' });

      expect(response.status).toBe(200);
      expect(response.body.name).toBe('Updated Group');
    });

    it('should return 404 if group not found', async () => {
      mockGroupFindOneAndUpdate.mockResolvedValue(null);

      const response = await request(app)
        .patch(`/api/group/${testGroupId}`)
        .send({ name: 'Updated Group' });

      expect(response.status).toBe(404);
    });
  });

  describe('DELETE /api/group/:id', () => {
    it('should delete a group and related data', async () => {
      mockGroupFindOneAndDelete.mockResolvedValue(mockGroup);
      mockMemberDeleteMany.mockResolvedValue({});
      mockMeetingDeleteMany.mockResolvedValue({});

      const response = await request(app)
        .delete(`/api/group/${testGroupId}`);

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Group deleted');
    });
  });

  describe('GET /api/members', () => {
    it('should return members for a group', async () => {
      const response = await request(app)
        .get('/api/members')
        .query({ groupId: testGroupId });

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
    });

    it('should return 400 if groupId is missing', async () => {
      const response = await request(app)
        .get('/api/members');

      expect(response.status).toBe(400);
    });

    it('should return 404 if group not found', async () => {
      mockGroupFindById.mockResolvedValue(null);

      const response = await request(app)
        .get('/api/members')
        .query({ groupId: testGroupId });

      expect(response.status).toBe(404);
    });

    it('should return 403 if user is not a member', async () => {
      mockMemberFindOne.mockResolvedValue(null);

      const response = await request(app)
        .get('/api/members')
        .query({ groupId: testGroupId });

      expect(response.status).toBe(403);
    });
  });

  describe('POST /api/members', () => {
    it('should invite a new member successfully', async () => {
      mockMemberCreate.mockResolvedValue(mockMember);
      mockMemberCountDocuments.mockResolvedValue(2);
      sendInviteEmail.mockResolvedValue(true);

      const response = await request(app)
        .post('/api/members')
        .send({
          name: 'Jane Doe',
          contact: 'jane@example.com',
          groupId: testGroupId,
        });

      expect(response.status).toBe(201);
      expect(sendInviteEmail).toHaveBeenCalled();
    });

    it('should return 400 if email is invalid', async () => {
      const response = await request(app)
        .post('/api/members')
        .send({
          name: 'Jane Doe',
          contact: 'invalid-email',
          groupId: testGroupId,
        });

      expect(response.status).toBe(400);
    });

    it('should return 409 if email already invited', async () => {
      mockMemberFindOne.mockResolvedValue(mockMember);

      const response = await request(app)
        .post('/api/members')
        .send({
          name: 'Jane Doe',
          contact: 'jane@example.com',
          groupId: testGroupId,
        });

      expect(response.status).toBe(409);
    });

    it('should handle invite email failure gracefully', async () => {
      mockMemberCreate.mockResolvedValue(mockMember);
      sendInviteEmail.mockRejectedValue(new Error('Email failed'));

      const response = await request(app)
        .post('/api/members')
        .send({
          name: 'Jane Doe',
          contact: 'jane@example.com',
          groupId: testGroupId,
        });

      expect(response.status).toBe(201); // Still creates member
    });
  });

  describe('POST /api/members/accept-invite', () => {
    it('should accept a valid invite', async () => {
      const pendingMember = {
        ...mockMember,
        status: 'pending',
        inviteToken: 'valid-token',
        inviteExpiry: new Date(Date.now() + 86400000),
        save: jest.fn().mockResolvedValue(true),
      };
      mockMemberFindOne.mockResolvedValue(pendingMember);
      mockUserFindOne.mockResolvedValue(mockUser);

      const response = await request(app)
        .post('/api/members/accept-invite')
        .send({
          token: 'valid-token',
          groupId: testGroupId,
        });

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Invite accepted successfully');
    });

    it('should return 400 for invalid or expired token', async () => {
      mockMemberFindOne.mockResolvedValue(null);

      const response = await request(app)
        .post('/api/members/accept-invite')
        .send({
          token: 'invalid-token',
          groupId: testGroupId,
        });

      expect(response.status).toBe(400);
    });
  });

  describe('PATCH /api/members/:id/role', () => {
    it('should assign a role to a member', async () => {
      mockMemberFindById.mockResolvedValue(mockMember);

      const response = await request(app)
        .patch(`/api/members/${testMemberId}/role`)
        .send({ role: 'Treasurer' });

      expect(response.status).toBe(200);
    });

    it('should return 400 for invalid role', async () => {
      const response = await request(app)
        .patch(`/api/members/${testMemberId}/role`)
        .send({ role: 'InvalidRole' });

      expect(response.status).toBe(400);
    });

    it('should return 404 if member not found', async () => {
      mockMemberFindById.mockResolvedValue(null);

      const response = await request(app)
        .patch(`/api/members/${testMemberId}/role`)
        .send({ role: 'Treasurer' });

      expect(response.status).toBe(404);
    });
  });

  describe('POST /api/meetings', () => {
    it('should create a meeting successfully', async () => {
      const mockMeeting = {
        _id: testMeetingId,
        group: testGroupId,
        date: '2024-06-15',
        time: '14:00',
        venue: 'Community Hall',
        status: 'upcoming',
        save: jest.fn().mockResolvedValue(true),
        populate: jest.fn().mockReturnThis(),
      };
      mockMeetingCreate.mockResolvedValue(mockMeeting);
      mockMemberFind.mockResolvedValue([mockMember]);
      sendMeetingNotification.mockResolvedValue(true);

      const response = await request(app)
        .post('/api/meetings')
        .send({
          groupId: testGroupId,
          date: '2024-06-15',
          time: '14:00',
          venue: 'Community Hall',
          agenda: 'Discuss payouts',
        });

      expect(response.status).toBe(201);
    });

    it('should return 400 if required fields are missing', async () => {
      const response = await request(app)
        .post('/api/meetings')
        .send({
          date: '2024-06-15',
        });

      expect(response.status).toBe(400);
    });
  });

  describe('GET /api/meetings', () => {
    it('should return meetings for a group', async () => {
      mockMeetingFind.mockReturnValue({
        sort: jest.fn().mockResolvedValue([])
      });

      const response = await request(app)
        .get('/api/meetings')
        .query({ groupId: testGroupId });

      expect(response.status).toBe(200);
    });

    it('should return 400 if groupId is missing', async () => {
      const response = await request(app)
        .get('/api/meetings');

      expect(response.status).toBe(400);
    });
  });

  describe('POST /api/flag-missing', () => {
    it('should flag missing contributions', async () => {
      const memberWithMissing = {
        ...mockMember,
        contributions: [{ month: '2024-06', status: 'missed' }]
      };
      mockMemberFind.mockResolvedValue([memberWithMissing]);
      sendMissingContributionEmail.mockResolvedValue(true);

      const response = await request(app)
        .post('/api/flag-missing')
        .send({
          groupId: testGroupId,
          month: '2024-06',
        });

      expect(response.status).toBe(200);
      expect(response.body.flagged).toBeGreaterThan(0);
    });

    it('should return message when all members have paid', async () => {
      const memberWithPaid = {
        ...mockMember,
        contributions: [{ month: '2024-06', status: 'paid' }]
      };
      mockMemberFind.mockResolvedValue([memberWithPaid]);

      const response = await request(app)
        .post('/api/flag-missing')
        .send({
          groupId: testGroupId,
          month: '2024-06',
        });

      expect(response.status).toBe(200);
      expect(response.body.message).toContain('All members have paid');
    });
  });

  describe('Unauthorized access', () => {
    it('should return 401 when no auth token is provided', async () => {
      const noAuthApp = express();
      noAuthApp.use(express.json());
      noAuthApp.use('/api', groupRoutes);

      const response = await request(noAuthApp)
        .get('/api/groups');

      expect(response.status).toBe(401);
    });
  });
});