// file: server/tests/reportController.test.js

const mongoose = require('mongoose');
const PDFDocument = require('pdfkit');

// Mock PDFKit
jest.mock('pdfkit', () => {
  return jest.fn().mockImplementation(() => ({
    pipe: jest.fn(),
    rect: jest.fn().mockReturnThis(),
    fill: jest.fn().mockReturnThis(),
    font: jest.fn().mockReturnThis(),
    fontSize: jest.fn().mockReturnThis(),
    fillColor: jest.fn().mockReturnThis(),
    text: jest.fn().mockReturnThis(),
    addPage: jest.fn().mockReturnThis(),
    end: jest.fn(),
    page: {
      margins: { left: 36, right: 36, top: 36, bottom: 36 },
      width: 842,
      height: 595
    }
  }));
});

// Mock mongoose models
const mockGroupFindById = jest.fn();
const mockMemberFind = jest.fn();
const mockContributionFind = jest.fn();

// Mock mongoose to control model behavior
jest.mock('mongoose', () => {
  const originalMongoose = jest.requireActual('mongoose');
  return {
    ...originalMongoose,
    models: {
      Group: {
        findById: mockGroupFindById
      },
      Member: {
        find: mockMemberFind
      },
      Contribution: {
        find: mockContributionFind
      }
    },
    model: jest.fn()
  };
});

// Import the controller after mocks are set up
const {
  getContributionCompliance,
  exportCompliancePDF,
  exportComplianceCSV
} = require('../controllers/reportController');

describe('Report Controller', () => {
  // Sample test data
  const validGroupId = new mongoose.Types.ObjectId('507f1f77bcf86cd799439011');
  const memberId1 = new mongoose.Types.ObjectId('507f1f77bcf86cd799439022');
  const memberId2 = new mongoose.Types.ObjectId('507f1f77bcf86cd799439033');
  const memberId3 = new mongoose.Types.ObjectId('507f1f77bcf86cd799439044');

  const mockGroup = {
    _id: validGroupId,
    name: 'Test Stokvel Group',
    amount: 250,
    freq: 'Monthly',
    createdAt: new Date('2024-01-01T00:00:00Z'),
    owner: new mongoose.Types.ObjectId('507f1f77bcf86cd799439055')
  };

  const mockMembers = [
    {
      _id: memberId1,
      name: 'John Doe',
      contact: 'john@example.com',
      role: 'member',
      group: validGroupId,
      status: 'active'
    },
    {
      _id: memberId2,
      name: 'Jane Smith',
      contact: 'jane@example.com',
      role: 'treasurer',
      group: validGroupId,
      status: 'active'
    },
    {
      _id: memberId3,
      name: 'Bob Johnson',
      contact: 'bob@example.com',
      role: 'member',
      group: validGroupId,
      status: 'active'
    }
  ];

  const mockContributions = [
    {
      _id: new mongoose.Types.ObjectId('507f1f77bcf86cd799439066'),
      member: memberId1,
      group: validGroupId,
      amount: 250,
      month: '2024-01',
      status: 'paid',
      paidAt: new Date('2024-01-15T10:00:00Z'),
      createdAt: new Date('2024-01-15T10:00:00Z')
    },
    {
      _id: new mongoose.Types.ObjectId('507f1f77bcf86cd799439077'),
      member: memberId1,
      group: validGroupId,
      amount: 250,
      month: '2024-02',
      status: 'paid',
      paidAt: new Date('2024-02-14T08:00:00Z'),
      createdAt: new Date('2024-02-14T08:00:00Z')
    },
    {
      _id: new mongoose.Types.ObjectId('507f1f77bcf86cd799439088'),
      member: memberId2,
      group: validGroupId,
      amount: 250,
      month: '2024-01',
      status: 'paid',
      paidAt: new Date('2024-01-16T12:00:00Z'),
      createdAt: new Date('2024-01-16T12:00:00Z')
    },
    {
      _id: new mongoose.Types.ObjectId('507f1f77bcf86cd799439099'),
      member: memberId2,
      group: validGroupId,
      amount: 250,
      month: '2024-02',
      status: 'pending',
      paidAt: null,
      createdAt: new Date('2024-02-01T00:00:00Z')
    },
    {
      _id: new mongoose.Types.ObjectId('507f1f77bcf86cd799439100'),
      member: memberId3,
      group: validGroupId,
      amount: 250,
      month: '2024-01',
      status: 'missed',
      paidAt: null,
      createdAt: new Date('2024-01-01T00:00:00Z')
    }
  ];

  beforeEach(() => {
    // Reset all mocks before each test
    jest.clearAllMocks();
    
    // Set up default mock implementations
    mockGroupFindById.mockResolvedValue(mockGroup);
    mockMemberFind.mockReturnValue({
      sort: jest.fn().mockResolvedValue(mockMembers)
    });
    mockContributionFind.mockResolvedValue(mockContributions);
  });

  // Helper function to create mock request and response objects
  function createMockReqRes(params = {}) {
    const req = {
      params: params.params || { groupId: validGroupId.toString() },
      query: params.query || {}
    };
    
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
      setHeader: jest.fn().mockReturnThis(),
      headersSent: false
    };
    
    return { req, res };
  }

  describe('buildReportData', () => {
    it('should build report data for a group with monthly frequency', async () => {
      const { req, res } = createMockReqRes();

      await getContributionCompliance(req, res);

      expect(res.json).toHaveBeenCalled();
      const reportData = res.json.mock.calls[0][0];
      
      // Verify group information
      expect(reportData.groupName).toBe('Test Stokvel Group');
      expect(reportData.freq).toBe('Monthly');
      expect(reportData.amount).toBe(250);
      
      // Verify periods are generated
      expect(reportData.periods).toBeDefined();
      expect(reportData.periods.length).toBeGreaterThan(0);
      
      // Verify member reports
      expect(reportData.report).toHaveLength(3);
      
      // Check first member (John Doe - 2 paid contributions)
      const johnReport = reportData.report.find(r => r.name === 'John Doe');
      expect(johnReport).toBeDefined();
      expect(johnReport.totalPaid).toBe(2);
      expect(johnReport.totalPaidAmount).toBe(500);
      expect(johnReport.compliancePercentage).toBeGreaterThan(0);
      
      // Check second member (Jane Smith - 1 paid, 1 pending)
      const janeReport = reportData.report.find(r => r.name === 'Jane Smith');
      expect(janeReport).toBeDefined();
      expect(janeReport.totalPaid).toBe(1);
      expect(janeReport.pendingCount).toBe(1);
      
      // Check third member (Bob Johnson - 1 missed)
      const bobReport = reportData.report.find(r => r.name === 'Bob Johnson');
      expect(bobReport).toBeDefined();
      expect(bobReport.totalPaid).toBe(0);
      expect(bobReport.missedCount).toBe(1);
    });

    it('should handle groups with weekly frequency', async () => {
      const weeklyGroup = {
        ...mockGroup,
        freq: 'Weekly',
        createdAt: new Date('2024-01-01T00:00:00Z')
      };
      mockGroupFindById.mockResolvedValue(weeklyGroup);

      const { req, res } = createMockReqRes();

      await getContributionCompliance(req, res);

      const reportData = res.json.mock.calls[0][0];
      expect(reportData.freq).toBe('Weekly');
      expect(reportData.periods.length).toBeGreaterThan(0);
    });

    it('should handle groups with bi-weekly frequency', async () => {
      const biWeeklyGroup = {
        ...mockGroup,
        freq: 'Bi-weekly',
        createdAt: new Date('2024-01-01T00:00:00Z')
      };
      mockGroupFindById.mockResolvedValue(biWeeklyGroup);

      const { req, res } = createMockReqRes();

      await getContributionCompliance(req, res);

      const reportData = res.json.mock.calls[0][0];
      expect(reportData.freq).toBe('Bi-weekly');
    });

    it('should calculate group compliance correctly', async () => {
      const { req, res } = createMockReqRes();

      await getContributionCompliance(req, res);

      const reportData = res.json.mock.calls[0][0];
      expect(reportData.groupCompliance).toBeDefined();
      expect(typeof reportData.groupCompliance).toBe('number');
      expect(reportData.groupCompliance).toBeGreaterThanOrEqual(0);
      expect(reportData.groupCompliance).toBeLessThanOrEqual(100);
    });
  });

  describe('getContributionCompliance', () => {
    it('should return JSON report successfully', async () => {
      const { req, res } = createMockReqRes();

      await getContributionCompliance(req, res);

      expect(res.status).not.toHaveBeenCalledWith(404);
      expect(res.status).not.toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalled();
      
      const reportData = res.json.mock.calls[0][0];
      expect(reportData).toHaveProperty('groupName');
      expect(reportData).toHaveProperty('freq');
      expect(reportData).toHaveProperty('amount');
      expect(reportData).toHaveProperty('periods');
      expect(reportData).toHaveProperty('report');
      expect(reportData).toHaveProperty('groupCompliance');
    });

    it('should return 404 when group is not found', async () => {
      mockGroupFindById.mockResolvedValue(null);
      const { req, res } = createMockReqRes();

      await getContributionCompliance(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Group not found' });
    });

    it('should return 500 when database error occurs', async () => {
      const dbError = new Error('Database connection failed');
      mockGroupFindById.mockRejectedValue(dbError);
      const { req, res } = createMockReqRes();

      await getContributionCompliance(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Database connection failed' });
    });

    it('should handle groups with no members', async () => {
      mockMemberFind.mockReturnValue({
        sort: jest.fn().mockResolvedValue([])
      });
      mockContributionFind.mockResolvedValue([]);

      const { req, res } = createMockReqRes();

      await getContributionCompliance(req, res);

      const reportData = res.json.mock.calls[0][0];
      expect(reportData.report).toHaveLength(0);
      expect(reportData.groupCompliance).toBe(0);
    });

    it('should handle groups with no contributions', async () => {
      mockContributionFind.mockResolvedValue([]);

      const { req, res } = createMockReqRes();

      await getContributionCompliance(req, res);

      const reportData = res.json.mock.calls[0][0];
      reportData.report.forEach(member => {
        expect(member.totalPaid).toBe(0);
        expect(member.totalPaidAmount).toBe(0);
        expect(member.compliancePercentage).toBe(0);
      });
    });

    it('should match contributions to correct periods for monthly frequency', async () => {
      const { req, res } = createMockReqRes();

      await getContributionCompliance(req, res);

      const reportData = res.json.mock.calls[0][0];
      const johnReport = reportData.report.find(r => r.name === 'John Doe');
      
      // John should have paid for January 2024 and February 2024
      const januaryPeriod = johnReport.periodStatuses.find(
        ps => ps.periodId === '2024-01'
      );
      const februaryPeriod = johnReport.periodStatuses.find(
        ps => ps.periodId === '2024-02'
      );
      
      expect(januaryPeriod.status).toBe('paid');
      expect(januaryPeriod.amount).toBe(250);
      expect(februaryPeriod.status).toBe('paid');
      expect(februaryPeriod.amount).toBe(250);
    });

    it('should handle members with pending contributions', async () => {
      const { req, res } = createMockReqRes();

      await getContributionCompliance(req, res);

      const reportData = res.json.mock.calls[0][0];
      const janeReport = reportData.report.find(r => r.name === 'Jane Smith');
      
      const pendingPeriod = janeReport.periodStatuses.find(
        ps => ps.status === 'pending'
      );
      
      expect(pendingPeriod).toBeDefined();
      expect(pendingPeriod.amount).toBe(0);
    });
  });

  describe('exportComplianceCSV', () => {
    it('should export CSV report successfully', async () => {
      const { req, res } = createMockReqRes();

      await exportComplianceCSV(req, res);

      expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/csv');
      expect(res.setHeader).toHaveBeenCalledWith(
        'Content-Disposition',
        expect.stringContaining('attachment; filename="compliance_')
      );
      expect(res.send).toHaveBeenCalled();
      
      const csvContent = res.send.mock.calls[0][0];
      expect(csvContent).toContain('STOKVEL CONTRIBUTION COMPLIANCE REPORT');
      expect(csvContent).toContain('Test Stokvel Group');
      expect(csvContent).toContain('John Doe');
      expect(csvContent).toContain('Jane Smith');
      expect(csvContent).toContain('PAID');
      expect(csvContent).toContain('PENDING');
      expect(csvContent).toContain('MISSED');
    });

    it('should return 404 when group is not found for CSV', async () => {
      mockGroupFindById.mockResolvedValue(null);
      const { req, res } = createMockReqRes();

      await exportComplianceCSV(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Group not found' });
    });

    it('should handle CSV export with database errors', async () => {
      mockGroupFindById.mockRejectedValue(new Error('Export failed'));
      const { req, res } = createMockReqRes();

      await exportComplianceCSV(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Export failed' });
    });

    it('should include compliance standing in CSV', async () => {
      const { req, res } = createMockReqRes();

      await exportComplianceCSV(req, res);

      const csvContent = res.send.mock.calls[0][0];
      expect(csvContent).toContain('Standing');
      expect(csvContent).toContain('GOOD');
    });

    it('should generate CSV with proper headers', async () => {
      const { req, res } = createMockReqRes();

      await exportComplianceCSV(req, res);

      const csvContent = res.send.mock.calls[0][0];
      const lines = csvContent.split('\n');
      
      expect(lines[0]).toContain('STOKVEL CONTRIBUTION COMPLIANCE REPORT');
      
      // Find the summary headers line
      const headerLine = lines.find(line => line.includes('Member,Email,Role'));
      expect(headerLine).toBeDefined();
      expect(headerLine).toContain('Expected');
      expect(headerLine).toContain('Paid');
      expect(headerLine).toContain('Missed');
      expect(headerLine).toContain('Total Paid (R)');
      expect(headerLine).toContain('Compliance %');
    });
  });

  describe('exportCompliancePDF', () => {
    it('should export PDF report successfully', async () => {
      const { req, res } = createMockReqRes();

      await exportCompliancePDF(req, res);

      expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'application/pdf');
      expect(res.setHeader).toHaveBeenCalledWith(
        'Content-Disposition',
        expect.stringContaining('attachment; filename="compliance_')
      );
      expect(PDFDocument).toHaveBeenCalledWith(
        expect.objectContaining({
          margin: 36,
          size: 'A4',
          layout: 'landscape'
        })
      );
    });

    it('should return 404 when group is not found for PDF', async () => {
      mockGroupFindById.mockResolvedValue(null);
      const { req, res } = createMockReqRes();

      await exportCompliancePDF(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Group not found' });
    });

    it('should handle PDF generation errors', async () => {
      const pdfError = new Error('PDF generation failed');
      PDFDocument.mockImplementation(() => {
        throw pdfError;
      });
      
      const { req, res } = createMockReqRes();

      await exportCompliancePDF(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'PDF generation failed' });
    });

    it('should create PDF with proper page layout', async () => {
      const { req, res } = createMockReqRes();

      await exportCompliancePDF(req, res);

      expect(PDFDocument).toHaveBeenCalledWith(
        expect.objectContaining({
          layout: 'landscape',
          size: 'A4'
        })
      );
    });

    it('should not send error response if headers already sent', async () => {
      const { req, res } = createMockReqRes();
      res.headersSent = true;

      // Force an error after headers are sent
      mockGroupFindById.mockRejectedValue(new Error('Late error'));

      await exportCompliancePDF(req, res);

      // Should not attempt to send error since headers are already sent
      expect(res.status).not.toHaveBeenCalled();
    });
  });

  describe('generatePeriods', () => {
    it('should generate correct number of monthly periods', async () => {
      const pastGroup = {
        ...mockGroup,
        createdAt: new Date('2024-01-01T00:00:00Z')
      };
      mockGroupFindById.mockResolvedValue(pastGroup);

      const { req, res } = createMockReqRes();
      await getContributionCompliance(req, res);

      const reportData = res.json.mock.calls[0][0];
      
      // Should generate periods from January 2024 to current month
      expect(reportData.periods.length).toBeGreaterThanOrEqual(1);
      
      // First period should be January 2024
      expect(reportData.periods[0].id).toContain('2024-01');
    });

    it('should generate weekly periods correctly', async () => {
      const weeklyGroup = {
        ...mockGroup,
        freq: 'Weekly',
        createdAt: new Date('2024-01-01T00:00:00Z')
      };
      mockGroupFindById.mockResolvedValue(weeklyGroup);

      const { req, res } = createMockReqRes();
      await getContributionCompliance(req, res);

      const reportData = res.json.mock.calls[0][0];
      expect(reportData.periods[0].type).toBe('weekly');
      expect(reportData.periods[0].id).toContain('-W');
    });

    it('should generate bi-weekly periods correctly', async () => {
      const biWeeklyGroup = {
        ...mockGroup,
        freq: 'Bi-weekly',
        createdAt: new Date('2024-01-01T00:00:00Z')
      };
      mockGroupFindById.mockResolvedValue(biWeeklyGroup);

      const { req, res } = createMockReqRes();
      await getContributionCompliance(req, res);

      const reportData = res.json.mock.calls[0][0];
      expect(reportData.periods[0].type).toBe('biweekly');
      expect(reportData.periods[0].id).toContain('-BW');
    });

    it('should default to monthly when no frequency specified', async () => {
      const noFreqGroup = {
        ...mockGroup,
        freq: undefined
      };
      mockGroupFindById.mockResolvedValue(noFreqGroup);

      const { req, res } = createMockReqRes();
      await getContributionCompliance(req, res);

      const reportData = res.json.mock.calls[0][0];
      expect(reportData.freq).toBe('Monthly');
    });
  });

  describe('Report data structure validation', () => {
    it('should include all required fields in member report', async () => {
      const { req, res } = createMockReqRes();
      await getContributionCompliance(req, res);

      const reportData = res.json.mock.calls[0][0];
      const member = reportData.report[0];

      expect(member).toHaveProperty('memberId');
      expect(member).toHaveProperty('name');
      expect(member).toHaveProperty('email');
      expect(member).toHaveProperty('role');
      expect(member).toHaveProperty('periodStatuses');
      expect(member).toHaveProperty('totalExpected');
      expect(member).toHaveProperty('totalPaid');
      expect(member).toHaveProperty('totalPaidAmount');
      expect(member).toHaveProperty('missedCount');
      expect(member).toHaveProperty('pendingCount');
      expect(member).toHaveProperty('compliancePercentage');
    });

    it('should calculate compliance percentage between 0 and 100', async () => {
      const { req, res } = createMockReqRes();
      await getContributionCompliance(req, res);

      const reportData = res.json.mock.calls[0][0];
      
      reportData.report.forEach(member => {
        expect(member.compliancePercentage).toBeGreaterThanOrEqual(0);
        expect(member.compliancePercentage).toBeLessThanOrEqual(100);
      });
      
      expect(reportData.groupCompliance).toBeGreaterThanOrEqual(0);
      expect(reportData.groupCompliance).toBeLessThanOrEqual(100);
    });

    it('should include period statuses with correct structure', async () => {
      const { req, res } = createMockReqRes();
      await getContributionCompliance(req, res);

      const reportData = res.json.mock.calls[0][0];
      const periodStatus = reportData.report[0].periodStatuses[0];

      expect(periodStatus).toHaveProperty('periodId');
      expect(periodStatus).toHaveProperty('label');
      expect(periodStatus).toHaveProperty('status');
      expect(periodStatus).toHaveProperty('amount');
      expect(periodStatus).toHaveProperty('paidAt');
      
      // Status should be one of the valid values
      expect(['paid', 'pending', 'missed']).toContain(periodStatus.status);
    });
  });

  describe('Error handling', () => {
    it('should handle missing Group model', async () => {
      // Temporarily remove Group model
      const originalGroup = mongoose.models.Group;
      delete mongoose.models.Group;

      const { req, res } = createMockReqRes();
      await getContributionCompliance(req, res);

      expect(res.status).toHaveBeenCalledWith(500);

      // Restore Group model
      mongoose.models.Group = originalGroup;
    });

    it('should handle missing Member model', async () => {
      // Temporarily remove Member model
      const originalMember = mongoose.models.Member;
      delete mongoose.models.Member;

      const { req, res } = createMockReqRes();
      await getContributionCompliance(req, res);

      expect(res.status).toHaveBeenCalledWith(500);

      // Restore Member model
      mongoose.models.Member = originalMember;
    });

    it('should handle null members gracefully', async () => {
      mockMemberFind.mockReturnValue({
        sort: jest.fn().mockResolvedValue(null)
      });

      const { req, res } = createMockReqRes();
      await getContributionCompliance(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('Performance and edge cases', () => {
    it('should handle large number of members efficiently', async () => {
      // Create 100 mock members
      const largeMemberSet = Array.from({ length: 100 }, (_, i) => ({
        _id: new mongoose.Types.ObjectId(),
        name: `Member ${i + 1}`,
        contact: `member${i + 1}@example.com`,
        role: 'member',
        group: validGroupId,
        status: 'active'
      }));

      mockMemberFind.mockReturnValue({
        sort: jest.fn().mockResolvedValue(largeMemberSet)
      });

      const { req, res } = createMockReqRes();
      await getContributionCompliance(req, res);

      const reportData = res.json.mock.calls[0][0];
      expect(reportData.report).toHaveLength(100);
    });

    it('should handle very old group creation dates', async () => {
      const oldGroup = {
        ...mockGroup,
        createdAt: new Date('2020-01-01T00:00:00Z')
      };
      mockGroupFindById.mockResolvedValue(oldGroup);

      const { req, res } = createMockReqRes();
      await getContributionCompliance(req, res);

      const reportData = res.json.mock.calls[0][0];
      // Should generate many periods
      expect(reportData.periods.length).toBeGreaterThan(12);
    });

    it('should handle groups created in the future (edge case)', async () => {
      const futureGroup = {
        ...mockGroup,
        createdAt: new Date('2025-12-01T00:00:00Z')
      };
      mockGroupFindById.mockResolvedValue(futureGroup);

      const { req, res } = createMockReqRes();
      await getContributionCompliance(req, res);

      const reportData = res.json.mock.calls[0][0];
      // Should have minimal periods
      expect(reportData.periods.length).toBeLessThanOrEqual(1);
    });
  });
});