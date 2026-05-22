// file: server/tests/notificationController.test.js

const request = require('supertest');
const express = require('express');
const mongoose = require('mongoose');

// Mock the User model
jest.mock('../models/users', () => {
  return {
    findOne: jest.fn()
  };
});

// Mock the Notification model
jest.mock('../models/Notification', () => {
  return {
    find: jest.fn(),
    findById: jest.fn(),
    updateMany: jest.fn()
  };
});

const User = require('../models/users');
const Notification = require('../models/Notification');
const {
  getUnreadNotifications,
  markAsRead,
  markAllAsRead
} = require('../controllers/notificationController');

describe('Notification Controller', () => {
  let app;
  let router;

  // Sample test data
  const mockUserId = new mongoose.Types.ObjectId('507f1f77bcf86cd799439011');
  const mockNotificationId = new mongoose.Types.ObjectId('507f1f77bcf86cd799439022');

  const mockUser = {
    _id: mockUserId,
    auth0Id: 'auth0|123456789',
    email: 'test@example.com',
    username: 'testuser'
  };

  const mockNotifications = [
    {
      _id: mockNotificationId,
      userId: mockUserId,
      message: 'New contribution received',
      type: 'contribution',
      isRead: false,
      createdAt: new Date('2024-01-15T10:00:00Z'),
      save: jest.fn().mockResolvedValue(true)
    },
    {
      _id: new mongoose.Types.ObjectId('507f1f77bcf86cd799439033'),
      userId: mockUserId,
      message: 'Payout processed',
      type: 'payout',
      isRead: false,
      createdAt: new Date('2024-01-14T08:00:00Z'),
      save: jest.fn().mockResolvedValue(true)
    }
  ];

  beforeEach(() => {
    // Create fresh Express app for each test
    app = express();
    app.use(express.json());

    // Mock auth middleware to set req.userId
    app.use((req, res, next) => {
      req.userId = 'auth0|123456789';
      next();
    });

    // Set up notification routes
    router = express.Router();
    router.get('/unread', getUnreadNotifications);
    router.patch('/:id/read', markAsRead);
    router.patch('/read-all', markAllAsRead);

    app.use('/api/notifications', router);

    // Clear all mocks before each test
    jest.clearAllMocks();
  });

  describe('getUnreadNotifications', () => {
    it('should return unread notifications sorted by newest first', async () => {
      // Arrange
      User.findOne.mockResolvedValue(mockUser);
      Notification.find.mockReturnValue({
        sort: jest.fn().mockResolvedValue(mockNotifications)
      });

      // Act
      const response = await request(app)
        .get('/api/notifications/unread');

      // Assert
      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(2);
      expect(response.body[0].message).toBe('New contribution received');
      expect(response.body[1].message).toBe('Payout processed');
      
      // Verify User.findOne was called with correct auth0Id
      expect(User.findOne).toHaveBeenCalledWith({ auth0Id: 'auth0|123456789' });
      
      // Verify Notification.find was called with correct query
      expect(Notification.find).toHaveBeenCalledWith({
        userId: mockUser._id,
        isRead: false
      });
    });

    it('should return empty array when user has no unread notifications', async () => {
      // Arrange
      User.findOne.mockResolvedValue(mockUser);
      Notification.find.mockReturnValue({
        sort: jest.fn().mockResolvedValue([])
      });

      // Act
      const response = await request(app)
        .get('/api/notifications/unread');

      // Assert
      expect(response.status).toBe(200);
      expect(response.body).toEqual([]);
      expect(response.body).toHaveLength(0);
    });

    it('should return 404 when user is not found', async () => {
      // Arrange
      User.findOne.mockResolvedValue(null);

      // Act
      const response = await request(app)
        .get('/api/notifications/unread');

      // Assert
      expect(response.status).toBe(404);
      expect(response.body.error).toBe('User not found');
      
      // Verify Notification.find was not called since user was not found
      expect(Notification.find).not.toHaveBeenCalled();
    });

    it('should handle database errors when finding user', async () => {
      // Arrange
      const dbError = new Error('Database connection failed');
      User.findOne.mockRejectedValue(dbError);

      // Act
      const response = await request(app)
        .get('/api/notifications/unread');

      // Assert
      expect(response.status).toBe(500);
      expect(response.body.error).toBe('Database connection failed');
    });

    it('should handle database errors when finding notifications', async () => {
      // Arrange
      User.findOne.mockResolvedValue(mockUser);
      const dbError = new Error('Query timeout');
      Notification.find.mockReturnValue({
        sort: jest.fn().mockRejectedValue(dbError)
      });

      // Act
      const response = await request(app)
        .get('/api/notifications/unread');

      // Assert
      expect(response.status).toBe(500);
      expect(response.body.error).toBe('Query timeout');
    });

    it('should only return notifications belonging to the authenticated user', async () => {
      // Arrange
      const anotherUser = {
        _id: new mongoose.Types.ObjectId('507f1f77bcf86cd799439044'),
        auth0Id: 'auth0|different'
      };

      User.findOne.mockResolvedValue(mockUser);
      Notification.find.mockReturnValue({
        sort: jest.fn().mockResolvedValue(mockNotifications)
      });

      // Act
      const response = await request(app)
        .get('/api/notifications/unread');

      // Assert
      expect(response.status).toBe(200);
      
      // Verify the query filters by the authenticated user's MongoDB _id
      expect(Notification.find).toHaveBeenCalledWith({
        userId: mockUser._id,
        isRead: false
      });
    });
  });

  describe('markAsRead', () => {
    it('should mark a notification as read successfully', async () => {
      // Arrange
      User.findOne.mockResolvedValue(mockUser);
      Notification.findById.mockResolvedValue(mockNotifications[0]);

      // Act
      const response = await request(app)
        .patch(`/api/notifications/${mockNotificationId}/read`);

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      
      // Verify notification was found by correct ID
      expect(Notification.findById).toHaveBeenCalledWith(mockNotificationId.toString());
      
      // Verify isRead was set to true
      expect(mockNotifications[0].isRead).toBe(true);
      
      // Verify save was called
      expect(mockNotifications[0].save).toHaveBeenCalled();
    });

    it('should return 404 when notification is not found', async () => {
      // Arrange
      User.findOne.mockResolvedValue(mockUser);
      Notification.findById.mockResolvedValue(null);

      // Act
      const response = await request(app)
        .patch('/api/notifications/507f1f77bcf86cd799439099/read');

      // Assert
      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Notification not found');
    });

    it('should return 404 when user is not found', async () => {
      // Arrange
      User.findOne.mockResolvedValue(null);

      // Act
      const response = await request(app)
        .patch(`/api/notifications/${mockNotificationId}/read`);

      // Assert
      expect(response.status).toBe(404);
      expect(response.body.error).toBe('User not found');
      
      // Verify notification was not fetched since user was not found
      expect(Notification.findById).not.toHaveBeenCalled();
    });

    it('should return 403 when user tries to mark another users notification as read', async () => {
      // Arrange
      const anotherUserId = new mongoose.Types.ObjectId('507f1f77bcf86cd799439055');
      const notificationOwnedByAnother = {
        _id: mockNotificationId,
        userId: anotherUserId,
        isRead: false,
        save: jest.fn().mockResolvedValue(true)
      };

      User.findOne.mockResolvedValue(mockUser);
      Notification.findById.mockResolvedValue(notificationOwnedByAnother);

      // Act
      const response = await request(app)
        .patch(`/api/notifications/${mockNotificationId}/read`);

      // Assert
      expect(response.status).toBe(403);
      expect(response.body.error).toBe('Unauthorized');
      
      // Verify notification was not modified
      expect(notificationOwnedByAnother.isRead).toBe(false);
      expect(notificationOwnedByAnother.save).not.toHaveBeenCalled();
    });

    it('should handle database errors when finding notification', async () => {
      // Arrange
      const dbError = new Error('Database query failed');
      User.findOne.mockResolvedValue(mockUser);
      Notification.findById.mockRejectedValue(dbError);

      // Act
      const response = await request(app)
        .patch(`/api/notifications/${mockNotificationId}/read`);

      // Assert
      expect(response.status).toBe(500);
      expect(response.body.error).toBe('Database query failed');
    });

    it('should handle errors when saving notification', async () => {
      // Arrange
      const notificationWithSaveError = {
        ...mockNotifications[0],
        save: jest.fn().mockRejectedValue(new Error('Save failed'))
      };

      User.findOne.mockResolvedValue(mockUser);
      Notification.findById.mockResolvedValue(notificationWithSaveError);

      // Act
      const response = await request(app)
        .patch(`/api/notifications/${mockNotificationId}/read`);

      // Assert
      expect(response.status).toBe(500);
      expect(response.body.error).toBe('Save failed');
    });

    it('should handle invalid notification ID format', async () => {
      // Arrange
      User.findOne.mockResolvedValue(mockUser);
      const castError = new Error('Cast to ObjectId failed');
      castError.name = 'CastError';
      Notification.findById.mockRejectedValue(castError);

      // Act
      const response = await request(app)
        .patch('/api/notifications/invalid-id/read');

      // Assert
      expect(response.status).toBe(500);
    });
  });

  describe('markAllAsRead', () => {
    it('should mark all unread notifications as read successfully', async () => {
      // Arrange
      User.findOne.mockResolvedValue(mockUser);
      Notification.updateMany.mockResolvedValue({ 
        acknowledged: true, 
        modifiedCount: 5 
      });

      // Act
      const response = await request(app)
        .patch('/api/notifications/read-all');

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      
      // Verify updateMany was called with correct filter and update
      expect(Notification.updateMany).toHaveBeenCalledWith(
        { 
          userId: mockUser._id, 
          isRead: false 
        },
        { 
          isRead: true 
        }
      );
    });

    it('should return success even when no unread notifications exist', async () => {
      // Arrange
      User.findOne.mockResolvedValue(mockUser);
      Notification.updateMany.mockResolvedValue({ 
        acknowledged: true, 
        modifiedCount: 0 
      });

      // Act
      const response = await request(app)
        .patch('/api/notifications/read-all');

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      
      // Verify the operation was still attempted
      expect(Notification.updateMany).toHaveBeenCalled();
    });

    it('should return 404 when user is not found', async () => {
      // Arrange
      User.findOne.mockResolvedValue(null);

      // Act
      const response = await request(app)
        .patch('/api/notifications/read-all');

      // Assert
      expect(response.status).toBe(404);
      expect(response.body.error).toBe('User not found');
      
      // Verify updateMany was not called
      expect(Notification.updateMany).not.toHaveBeenCalled();
    });

    it('should handle database errors when finding user', async () => {
      // Arrange
      const dbError = new Error('Connection refused');
      User.findOne.mockRejectedValue(dbError);

      // Act
      const response = await request(app)
        .patch('/api/notifications/read-all');

      // Assert
      expect(response.status).toBe(500);
      expect(response.body.error).toBe('Connection refused');
    });

    it('should handle database errors during bulk update', async () => {
      // Arrange
      User.findOne.mockResolvedValue(mockUser);
      const updateError = new Error('Bulk write failed');
      Notification.updateMany.mockRejectedValue(updateError);

      // Act
      const response = await request(app)
        .patch('/api/notifications/read-all');

      // Assert
      expect(response.status).toBe(500);
      expect(response.body.error).toBe('Bulk write failed');
    });

    it('should only update notifications for the authenticated user', async () => {
      // Arrange
      User.findOne.mockResolvedValue(mockUser);
      Notification.updateMany.mockResolvedValue({ 
        acknowledged: true, 
        modifiedCount: 3 
      });

      // Act
      const response = await request(app)
        .patch('/api/notifications/read-all');

      // Assert
      expect(response.status).toBe(200);
      
      // Verify the filter includes the correct userId
      const filterArg = Notification.updateMany.mock.calls[0][0];
      expect(filterArg.userId).toEqual(mockUser._id);
      expect(filterArg.isRead).toBe(false);
    });
  });

  describe('Authentication and Authorization', () => {
    it('should handle requests without auth middleware', async () => {
      // Create app without auth middleware
      const unauthenticatedApp = express();
      unauthenticatedApp.use(express.json());
      unauthenticatedApp.use('/api/notifications', router);

      // Act
      const response = await request(unauthenticatedApp)
        .get('/api/notifications/unread');

      // Assert
      // The controller will try to find user with undefined auth0Id
      expect(response.status).toBe(404);
      expect(User.findOne).toHaveBeenCalledWith({ auth0Id: undefined });
    });

    it('should handle multiple concurrent requests correctly', async () => {
      // Arrange
      User.findOne.mockResolvedValue(mockUser);
      Notification.find.mockReturnValue({
        sort: jest.fn().mockResolvedValue(mockNotifications)
      });

      // Act - Make multiple concurrent requests
      const requests = [
        request(app).get('/api/notifications/unread'),
        request(app).get('/api/notifications/unread'),
        request(app).get('/api/notifications/unread')
      ];

      const responses = await Promise.all(requests);

      // Assert - All should succeed
      responses.forEach(response => {
        expect(response.status).toBe(200);
        expect(response.body).toHaveLength(2);
      });
    });
  });

  describe('Response structure', () => {
    it('should return notifications with correct structure', async () => {
      // Arrange
      User.findOne.mockResolvedValue(mockUser);
      Notification.find.mockReturnValue({
        sort: jest.fn().mockResolvedValue(mockNotifications)
      });

      // Act
      const response = await request(app)
        .get('/api/notifications/unread');

      // Assert
      expect(response.status).toBe(200);
      response.body.forEach(notification => {
        expect(notification).toHaveProperty('_id');
        expect(notification).toHaveProperty('userId');
        expect(notification).toHaveProperty('message');
        expect(notification).toHaveProperty('type');
        expect(notification).toHaveProperty('isRead');
        expect(notification).toHaveProperty('createdAt');
        expect(notification.isRead).toBe(false);
      });
    });

    it('should return error responses with consistent structure', async () => {
      // Arrange
      User.findOne.mockRejectedValue(new Error('Test error'));

      // Act
      const response = await request(app)
        .get('/api/notifications/unread');

      // Assert
      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty('error');
      expect(typeof response.body.error).toBe('string');
    });
  });
});