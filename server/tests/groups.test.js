jest.setTimeout(30000);
process.env.JWT_SECRET = 'test-secret';
jest.mock('../services/emailService', () => ({
  sendInviteEmail: jest.fn().mockResolvedValue(true),
  sendMeetingNotification: jest.fn().mockResolvedValue(true),
  sendMeetingMinutes: jest.fn().mockResolvedValue(true),
  sendMissingContributionEmail: jest.fn().mockResolvedValue(true),
  sendRoleAssignedEmail: jest.fn().mockResolvedValue(true),
  sendContributionReceiptEmail: jest.fn().mockResolvedValue(true),
}));

const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const jwt = require('jsonwebtoken');

let mongod;
let app;
let token;
let userId;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  process.env.JWT_SECRET = 'test_secret';
  process.env.CLIENT_URL = 'http://localhost:5173';
  app = require('../app');

  const UserModel = require('../models/users');
  const user = await UserModel.create({
    username: 'grouptest',
    email: 'grouptest@test.com',
    password: 'password123',
    role: 'member',
  });
  userId = user._id;
  token = jwt.sign({ id: userId }, 'test_secret', { expiresIn: '1d' });
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

afterEach(async () => {
  const Group = mongoose.models.Group;
  const Member = mongoose.models.Member;
  if (Group) await Group.deleteMany({});
  if (Member) await Member.deleteMany({});
});

describe('🏘️ GROUP TESTS', () => {

  test('✅ Should create a group successfully', async () => {
    const res = await request(app)
      .post('/api/group')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Test Stokvel',
        amount: 500,
        freq: 'Monthly',
        cycle: '12 Months',
        max: 10,
        payoutMethod: 'Fixed Order (First In First Out)',
        rules: 'Test rules',
      });

    expect(res.status).toBe(201);
    expect(res.body.name).toBe('Test Stokvel');
  });

  test('❌ Should fail if group name is missing', async () => {
    const res = await request(app)
      .post('/api/group')
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: 500, freq: 'Monthly' });

    expect(res.status).toBe(400);
  });

  test('❌ Should fail without token', async () => {
    const res = await request(app)
      .post('/api/group')
      .send({ name: 'Test Stokvel' });

    expect(res.status).toBe(401);
  });

  test('✅ Should get all groups for user', async () => {
    await request(app)
      .post('/api/group')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'My Stokvel',
        amount: 500,
        freq: 'Monthly',
        cycle: '12 Months',
        max: 10,
        payoutMethod: 'Fixed Order (First In First Out)',
        rules: 'Rules',
      });

    const res = await request(app)
      .get('/api/groups')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
  });

  test('✅ Creator should automatically be added as Admin member', async () => {
    await request(app)
      .post('/api/group')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Admin Test Group',
        amount: 500,
        freq: 'Monthly',
        cycle: '12 Months',
        max: 10,
        payoutMethod: 'Fixed Order (First In First Out)',
        rules: 'Rules',
      });

    const Member = mongoose.models.Member;
    const member = await Member.findOne({ contact: 'grouptest@test.com' });
    expect(member).not.toBeNull();
    expect(member.role).toBe('Admin');
    expect(member.status).toBe('active');
  });

  test('✅ Should get empty array when user has no groups', async () => {
    const res = await request(app)
      .get('/api/groups')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  test('❌ Should return 401 when getting groups without token', async () => {
    const res = await request(app).get('/api/groups');
    expect(res.status).toBe(401);
  });
});

describe('👥 MEMBER TESTS', () => {

  let groupId;

  beforeEach(async () => {
    const res = await request(app)
      .post('/api/group')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Member Test Group',
        amount: 500,
        freq: 'Monthly',
        cycle: '12 Months',
        max: 10,
        payoutMethod: 'Fixed Order (First In First Out)',
        rules: 'Rules',
      });
    groupId = res.body._id;
  });

  test('✅ Should invite a new member', async () => {
    const res = await request(app)
      .post('/api/members')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Zanele Dlamini',
        contact: 'zanele@test.com',
        groupId,
      });

    expect(res.status).toBe(201);
    expect(res.body.name).toBe('Zanele Dlamini');
    expect(res.body.status).toBe('pending');
  });

  test('❌ Should not invite duplicate email in same group', async () => {
    await request(app)
      .post('/api/members')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Zanele', contact: 'zanele@test.com', groupId });

    const res = await request(app)
      .post('/api/members')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Zanele Again', contact: 'zanele@test.com', groupId });

    expect(res.status).toBe(409);
  });

  test('❌ Should fail if name is missing', async () => {
    const res = await request(app)
      .post('/api/members')
      .set('Authorization', `Bearer ${token}`)
      .send({ contact: 'zanele@test.com', groupId });

    expect(res.status).toBe(400);
  });

  test('❌ Should fail if email is invalid', async () => {
    const res = await request(app)
      .post('/api/members')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Zanele', contact: 'notanemail', groupId });

    expect(res.status).toBe(400);
  });

  test('✅ Should get members for a group', async () => {
    const res = await request(app)
      .get(`/api/members?groupId=${groupId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});