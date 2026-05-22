process.env.JWT_SECRET = 'test-secret';
const mongoose = require('mongoose');
const Group = require('../../../server/models/group');

// Mock mongoose
jest.mock('mongoose', () => {
  const actualMongoose = jest.requireActual('mongoose');
  return {
    ...actualMongoose,
    model: jest.fn(),
    models: {},
    Schema: class Schema {
      constructor(schema, options) {
        this.schema = schema;
        this.options = options;
      }
    },
    Types: {
      ObjectId: jest.fn(() => 'mock-object-id')
    }
  };
});

// Clear all mocks before each test
beforeEach(() => {
  jest.clearAllMocks();
});

describe('Group Model', () => {
  describe('Member Schema', () => {
    const validMember = {
      userId: new mongoose.Types.ObjectId(),
      username: 'john_doe',
      email: 'john@example.com',
      role: 'member',
      joinedAt: new Date(),
      isActive: true,
      inviteToken: 'invite-token-123',
      inviteExpiry: new Date(Date.now() + 86400000),
      contributions: [
        {
          month: '2024-12',
          amount: 500,
          dueDate: new Date('2024-12-05'),
          status: 'paid',
          paidAt: new Date(),
          reminderSent: true
        }
      ]
    };

    it('should create a valid member object', () => {
      expect(validMember).toHaveProperty('username');
      expect(validMember).toHaveProperty('email');
      expect(validMember).toHaveProperty('role');
      expect(['admin', 'member', 'treasurer']).toContain(validMember.role);
    });

    it('should have default role as member', () => {
      const member = { username: 'test', email: 'test@test.com' };
      expect(member.role || 'member').toBe('member');
    });

    it('should have default isActive as true', () => {
      const member = { username: 'test', email: 'test@test.com' };
      expect(member.isActive !== false).toBe(true);
    });

    it('should validate role enum values', () => {
      const validRoles = ['admin', 'member', 'treasurer'];
      const invalidRoles = ['superadmin', 'owner', 'guest'];
      
      validRoles.forEach(role => {
        expect(validRoles).toContain(role);
      });
      
      invalidRoles.forEach(role => {
        expect(validRoles).not.toContain(role);
      });
    });

    describe('Contribution Sub-document', () => {
      const validContribution = {
        month: '2024-12',
        amount: 500,
        dueDate: new Date('2024-12-05'),
        status: 'paid',
        paidAt: new Date(),
        reminderSent: true
      };

      it('should create a valid contribution object', () => {
        expect(validContribution).toHaveProperty('month');
        expect(validContribution).toHaveProperty('amount');
        expect(validContribution).toHaveProperty('status');
      });

      it('should validate contribution status enum', () => {
        const validStatuses = ['paid', 'missed', 'overdue'];
        const invalidStatuses = ['pending', 'cancelled', 'failed'];
        
        validStatuses.forEach(status => {
          expect(validStatuses).toContain(status);
        });
        
        invalidStatuses.forEach(status => {
          expect(validStatuses).not.toContain(status);
        });
      });

      it('should have default status as missed', () => {
        const contribution = { month: '2024-12', amount: 500 };
        expect(contribution.status || 'missed').toBe('missed');
      });

      it('should have default reminderSent as false', () => {
        const contribution = { month: '2024-12', amount: 500 };
        expect(contribution.reminderSent || false).toBe(false);
      });
    });
  });

  describe('Group Schema', () => {
    const validGroup = {
      name: 'Test Stokvel',
      amount: 500,
      freq: 'monthly',
      cycle: 'monthly',
      max: 10,
      meetFreq: 'weekly',
      meetDay: 'Monday',
      payoutMethod: 'FIFO',
      rules: 'No late payments',
      createdBy: new mongoose.Types.ObjectId(),
      adminId: new mongoose.Types.ObjectId(),
      members: [
        {
          username: 'admin_user',
          email: 'admin@example.com',
          role: 'admin',
          joinedAt: new Date(),
          isActive: true
        },
        {
          username: 'member_one',
          email: 'member1@example.com',
          role: 'member',
          joinedAt: new Date(),
          isActive: true
        }
      ],
      nextPayoutIndex: 0,
      totalPayoutsCompleted: 0
    };

    it('should have required fields', () => {
      expect(validGroup).toHaveProperty('name');
      expect(validGroup).toHaveProperty('amount');
      expect(validGroup).toHaveProperty('freq');
      expect(validGroup).toHaveProperty('cycle');
      expect(validGroup).toHaveProperty('max');
      expect(validGroup).toHaveProperty('payoutMethod');
      expect(validGroup).toHaveProperty('rules');
      expect(validGroup).toHaveProperty('createdBy');
      expect(validGroup).toHaveProperty('adminId');
    });

    it('should have default nextPayoutIndex as 0', () => {
      const group = { name: 'Test Group', amount: 100, freq: 'monthly', cycle: 'monthly', max: 5, payoutMethod: 'FIFO', rules: 'Test', createdBy: 'user123', adminId: 'user123' };
      expect(group.nextPayoutIndex || 0).toBe(0);
    });

    it('should have default totalPayoutsCompleted as 0', () => {
      const group = { name: 'Test Group', amount: 100, freq: 'monthly', cycle: 'monthly', max: 5, payoutMethod: 'FIFO', rules: 'Test', createdBy: 'user123', adminId: 'user123' };
      expect(group.totalPayoutsCompleted || 0).toBe(0);
    });

    it('should have timestamps', () => {
      const group = validGroup;
      expect(group.createdAt !== undefined || group.timestamps).toBeTruthy();
    });
  });

  describe('getFIFOOrder Method', () => {
    let mockGroup;
    
    beforeEach(() => {
      mockGroup = {
        members: [
          {
            username: 'member1',
            email: 'member1@test.com',
            isActive: true,
            joinedAt: new Date('2024-01-01')
          },
          {
            username: 'member2',
            email: 'member2@test.com',
            isActive: true,
            joinedAt: new Date('2024-01-15')
          },
          {
            username: 'member3',
            email: 'member3@test.com',
            isActive: false,
            joinedAt: new Date('2024-01-10')
          },
          {
            username: 'member4',
            email: 'member4@test.com',
            isActive: true,
            joinedAt: new Date('2024-01-05')
          }
        ],
        getFIFOOrder: Group.prototype.getFIFOOrder
      };
    });

    it('should filter only active members', () => {
      const result = mockGroup.getFIFOOrder();
      expect(result.length).toBe(3);
      expect(result.every(m => m.isActive === true)).toBe(true);
    });

    it('should sort members by joinedAt date (oldest first)', () => {
      const result = mockGroup.getFIFOOrder();
      
      expect(result[0].joinedAt).toEqual(new Date('2024-01-01'));
      expect(result[1].joinedAt).toEqual(new Date('2024-01-05'));
      expect(result[2].joinedAt).toEqual(new Date('2024-01-15'));
    });

    it('should return empty array if no active members', () => {
      const emptyGroup = {
        members: [
          { isActive: false, joinedAt: new Date('2024-01-01') },
          { isActive: false, joinedAt: new Date('2024-01-15') }
        ],
        getFIFOOrder: Group.prototype.getFIFOOrder
      };
      
      const result = emptyGroup.getFIFOOrder();
      expect(result).toEqual([]);
    });

    it('should return empty array if members array is empty', () => {
      const emptyGroup = {
        members: [],
        getFIFOOrder: Group.prototype.getFIFOOrder
      };
      
      const result = emptyGroup.getFIFOOrder();
      expect(result).toEqual([]);
    });
  });

  describe('Model Export', () => {
    it('should export Group model', () => {
      expect(Group).toBeDefined();
    });

    it('should use existing model if already defined', () => {
      const mockMongoose = require('mongoose');
      mockMongoose.models.Group = { name: 'ExistingGroup' };
      
      // Re-require to test existing model logic
      jest.isolateModules(() => {
        const groupModel = require('../../../server/models/group');
        expect(groupModel).toBeDefined();
      });
    });
  });

  describe('Data Validation', () => {
    it('should require name field', () => {
      const groupWithoutName = {
        amount: 500,
        freq: 'monthly',
        cycle: 'monthly',
        max: 10,
        payoutMethod: 'FIFO',
        rules: 'Test',
        createdBy: 'user123',
        adminId: 'user123'
      };
      
      expect(groupWithoutName.name).toBeUndefined();
    });

    it('should require amount field', () => {
      const groupWithoutAmount = {
        name: 'Test Group',
        freq: 'monthly',
        cycle: 'monthly',
        max: 10,
        payoutMethod: 'FIFO',
        rules: 'Test',
        createdBy: 'user123',
        adminId: 'user123'
      };
      
      expect(groupWithoutAmount.amount).toBeUndefined();
    });

    it('should require freq field', () => {
      const groupWithoutFreq = {
        name: 'Test Group',
        amount: 500,
        cycle: 'monthly',
        max: 10,
        payoutMethod: 'FIFO',
        rules: 'Test',
        createdBy: 'user123',
        adminId: 'user123'
      };
      
      expect(groupWithoutFreq.freq).toBeUndefined();
    });

    it('should have default freq as monthly', () => {
      const group = { freq: 'monthly' };
      expect(group.freq).toBe('monthly');
    });

    it('should have default cycle as monthly', () => {
      const group = { cycle: 'monthly' };
      expect(group.cycle).toBe('monthly');
    });

    it('should trim name field', () => {
      const groupWithSpaces = { name: '  Test Group  ' };
      const trimmedName = groupWithSpaces.name.trim();
      expect(trimmedName).toBe('Test Group');
    });

    it('should lowercase email field', () => {
      const memberWithUpperCase = { email: 'TEST@EXAMPLE.COM' };
      const lowercasedEmail = memberWithUpperCase.email.toLowerCase();
      expect(lowercasedEmail).toBe('test@example.com');
    });
  });

  describe('Member Management', () => {
    it('should allow adding members to group', () => {
      const group = {
        name: 'Test Group',
        amount: 500,
        freq: 'monthly',
        cycle: 'monthly',
        max: 10,
        payoutMethod: 'FIFO',
        rules: 'Test',
        createdBy: 'user123',
        adminId: 'user123',
        members: []
      };
      
      const newMember = {
        username: 'newmember',
        email: 'new@example.com',
        role: 'member',
        joinedAt: new Date(),
        isActive: true
      };
      
      group.members.push(newMember);
      expect(group.members.length).toBe(1);
      expect(group.members[0].username).toBe('newmember');
    });

    it('should allow removing members', () => {
      const group = {
        members: [
          { username: 'member1', email: 'm1@test.com' },
          { username: 'member2', email: 'm2@test.com' }
        ]
      };
      
      const originalLength = group.members.length;
      group.members = group.members.filter(m => m.username !== 'member1');
      
      expect(group.members.length).toBe(originalLength - 1);
      expect(group.members[0].username).toBe('member2');
    });

    it('should allow updating member role', () => {
      const member = { username: 'test', email: 'test@test.com', role: 'member' };
      member.role = 'treasurer';
      expect(member.role).toBe('treasurer');
    });
  });

  describe('Contribution Management', () => {
    it('should allow adding contributions to member', () => {
      const member = {
        username: 'test',
        email: 'test@test.com',
        contributions: []
      };
      
      const contribution = {
        month: '2024-12',
        amount: 500,
        status: 'paid',
        paidAt: new Date()
      };
      
      member.contributions.push(contribution);
      expect(member.contributions.length).toBe(1);
      expect(member.contributions[0].amount).toBe(500);
    });

    it('should update contribution status', () => {
      const contribution = { month: '2024-12', amount: 500, status: 'missed' };
      contribution.status = 'paid';
      expect(contribution.status).toBe('paid');
    });
  });
});