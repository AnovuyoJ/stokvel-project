const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');

// ✅ Correct paths
const {
  getContributionCompliance,
  exportCompliancePDF,
  exportComplianceCSV,
} = require('../controllers/reportController');

// Mock the report controller
jest.mock('../controllers/reportController', () => ({
  getContributionCompliance: jest.fn(),
  exportCompliancePDF: jest.fn(),
  exportComplianceCSV: jest.fn(),
}));

// Import the router
const reportRoutes = require('../routes/reportRoutes');

describe('Report Routes', () => {
  let app;
  const validGroupId = '507f1f77bcf86cd799439011';

  beforeAll(() => {
    process.env.JWT_SECRET = 'test-secret';
  });

  beforeEach(() => {
    app = express();
    app.use(express.json());
    
    // Mock auth middleware inline
    app.use((req, res, next) => {
      req.userId = '507f1f77bcf86cd799439011';
      req.user = {
        _id: '507f1f77bcf86cd799439011',
        email: 'test@test.com',
        role: 'member'
      };
      next();
    });
    
    app.use('/api/reports', reportRoutes);
    jest.clearAllMocks();
  });

  describe('GET /api/reports/:groupId', () => {
    it('should return JSON by default', async () => {
      const mockData = {
        group: validGroupId,
        compliance: 85,
        members: []
      };

      getContributionCompliance.mockImplementation((req, res) => {
        return res.status(200).json(mockData);
      });

      const response = await request(app)
        .get(`/api/reports/${validGroupId}`);

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockData);
      expect(getContributionCompliance).toHaveBeenCalledTimes(1);
      expect(exportCompliancePDF).not.toHaveBeenCalled();
      expect(exportComplianceCSV).not.toHaveBeenCalled();
    });

    it('should call exportCompliancePDF when format=pdf', async () => {
      exportCompliancePDF.mockImplementation((req, res) => {
        res.setHeader('Content-Type', 'application/pdf');
        return res.status(200).send('PDF content');
      });

      const response = await request(app)
        .get(`/api/reports/${validGroupId}?format=pdf`);

      expect(response.status).toBe(200);
      expect(exportCompliancePDF).toHaveBeenCalledTimes(1);
      expect(getContributionCompliance).not.toHaveBeenCalled();
      expect(exportComplianceCSV).not.toHaveBeenCalled();
    });

    it('should call exportComplianceCSV when format=csv', async () => {
      exportComplianceCSV.mockImplementation((req, res) => {
        res.setHeader('Content-Type', 'text/csv');
        return res.status(200).send('CSV content');
      });

      const response = await request(app)
        .get(`/api/reports/${validGroupId}?format=csv`);

      expect(response.status).toBe(200);
      expect(exportComplianceCSV).toHaveBeenCalledTimes(1);
    });

    it('should handle unknown format gracefully', async () => {
      getContributionCompliance.mockImplementation((req, res) => {
        return res.status(200).json({});
      });

      const response = await request(app)
        .get(`/api/reports/${validGroupId}?format=unknown`);

      expect(response.status).toBe(200);
      expect(getContributionCompliance).toHaveBeenCalledTimes(1);
    });
  });
});