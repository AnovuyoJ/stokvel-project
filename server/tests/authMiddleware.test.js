// file: server/tests/middleware.test.js

const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');

// Import the middleware
const authenticate = require('../middleware/authenticate');

describe('Authenticate Middleware', () => {
  let app;

  // Set JWT secret before all tests
  beforeAll(() => {
    process.env.JWT_SECRET = 'test-secret-key-for-middleware-tests';
  });

  beforeEach(() => {
    // Create fresh Express app for each test
    app = express();
    app.use(express.json());

    // Apply the middleware to a test route
    app.get('/protected', authenticate, (req, res) => {
      res.json({
        message: 'Access granted',
        userId: req.userId,
        userRole: req.userRole
      });
    });

    // Route that uses the role from middleware
    app.get('/admin-only', authenticate, (req, res) => {
      if (req.userRole !== 'admin') {
        return res.status(403).json({ error: 'Admin access required' });
      }
      res.json({ message: 'Admin access granted' });
    });

    // Route that uses userId from middleware
    app.get('/user/:id', authenticate, (req, res) => {
      if (req.userId !== req.params.id) {
        return res.status(403).json({ error: 'Cannot access another user data' });
      }
      res.json({ message: 'User data accessed' });
    });
  });

  describe('Successful Authentication', () => {
    it('should allow access with valid token and attach userId', async () => {
      const token = jwt.sign(
        { id: '507f1f77bcf86cd799439011', role: 'member' },
        process.env.JWT_SECRET,
        { expiresIn: '1h' }
      );

      const response = await request(app)
        .get('/protected')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Access granted');
      expect(response.body.userId).toBe('507f1f77bcf86cd799439011');
      expect(response.body.userRole).toBe('member');
    });

    it('should attach userRole from token payload', async () => {
      const token = jwt.sign(
        { id: 'admin-user-123', role: 'admin' },
        process.env.JWT_SECRET,
        { expiresIn: '1h' }
      );

      const response = await request(app)
        .get('/protected')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.userRole).toBe('admin');
    });

    it('should pass user info to next middleware/route handler', async () => {
      const token = jwt.sign(
        { id: 'custom-user-456', role: 'treasurer' },
        process.env.JWT_SECRET,
        { expiresIn: '1h' }
      );

      const response = await request(app)
        .get('/protected')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.userId).toBe('custom-user-456');
      expect(response.body.userRole).toBe('treasurer');
    });

    it('should allow access to role-restricted routes with correct role', async () => {
      const token = jwt.sign(
        { id: 'admin-789', role: 'admin' },
        process.env.JWT_SECRET,
        { expiresIn: '1h' }
      );

      const response = await request(app)
        .get('/admin-only')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Admin access granted');
    });

    it('should allow access to user-specific routes with matching userId', async () => {
      const userId = 'specific-user-001';
      const token = jwt.sign(
        { id: userId, role: 'member' },
        process.env.JWT_SECRET,
        { expiresIn: '1h' }
      );

      const response = await request(app)
        .get(`/user/${userId}`)
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('User data accessed');
    });

    it('should handle token with additional claims', async () => {
      const token = jwt.sign(
        {
          id: 'user-with-claims',
          role: 'member',
          email: 'user@example.com',
          groupId: 'group-123',
          customClaim: 'custom-value'
        },
        process.env.JWT_SECRET,
        { expiresIn: '1h' }
      );

      const response = await request(app)
        .get('/protected')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.userId).toBe('user-with-claims');
      expect(response.body.userRole).toBe('member');
    });
  });

  describe('Missing or Invalid Authorization Header', () => {
    it('should return 401 when no Authorization header is present', async () => {
      const response = await request(app)
        .get('/protected');

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('You need to log in first');
    });

    it('should return 401 when Authorization header is undefined', async () => {
      const response = await request(app)
        .get('/protected')
        .set('Authorization', undefined);

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('You need to log in first');
    });

    it('should return 401 when Authorization header is null', async () => {
      const response = await request(app)
        .get('/protected')
        .set('Authorization', null);

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('You need to log in first');
    });

    it('should return 401 when Authorization header is empty string', async () => {
      const response = await request(app)
        .get('/protected')
        .set('Authorization', '');

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('You need to log in first');
    });

    it('should return 401 when Authorization header has wrong format', async () => {
      const response = await request(app)
        .get('/protected')
        .set('Authorization', 'InvalidFormatToken123');

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('You need to log in first');
    });

    it('should return 401 when using "Basic" instead of "Bearer"', async () => {
      const response = await request(app)
        .get('/protected')
        .set('Authorization', 'Basic someTokenHere');

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('You need to log in first');
    });

    it('should return 401 when "Bearer" prefix is missing', async () => {
      const token = jwt.sign(
        { id: 'test-user', role: 'member' },
        process.env.JWT_SECRET,
        { expiresIn: '1h' }
      );

      const response = await request(app)
        .get('/protected')
        .set('Authorization', token);

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('You need to log in first');
    });

    it('should return 401 when Authorization has "Bearer" but no token', async () => {
      const response = await request(app)
        .get('/protected')
        .set('Authorization', 'Bearer ');

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('You need to log in first');
    });

    it('should return 401 when Authorization has "Bearer" with multiple spaces', async () => {
      const response = await request(app)
        .get('/protected')
        .set('Authorization', 'Bearer    ');

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('You need to log in first');
    });
  });

  describe('Invalid or Expired Tokens', () => {
    it('should return 401 for expired token', async () => {
      const token = jwt.sign(
        { id: 'expired-user', role: 'member' },
        process.env.JWT_SECRET,
        { expiresIn: '0s' }
      );

      // Small delay to ensure token expires
      await new Promise(resolve => setTimeout(resolve, 1100));

      const response = await request(app)
        .get('/protected')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('Invalid or expired token');
    });

    it('should return 401 for token signed with wrong secret', async () => {
      const token = jwt.sign(
        { id: 'test-user', role: 'member' },
        'wrong-secret-key',
        { expiresIn: '1h' }
      );

      const response = await request(app)
        .get('/protected')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('Invalid or expired token');
    });

    it('should return 401 for malformed JWT token', async () => {
      const response = await request(app)
        .get('/protected')
        .set('Authorization', 'Bearer not.a.real.jwt.token');

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('Invalid or expired token');
    });

    it('should return 401 for token with only one segment', async () => {
      const response = await request(app)
        .get('/protected')
        .set('Authorization', 'Bearer invalidtoken');

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('Invalid or expired token');
    });

    it('should return 401 for token with tampered payload', async () => {
      const token = jwt.sign(
        { id: 'test-user', role: 'member' },
        process.env.JWT_SECRET,
        { expiresIn: '1h' }
      );

      // Tamper with the token
      const parts = token.split('.');
      const tamperedToken = `${parts[0]}.${parts[1]}tampered.${parts[2]}`;

      const response = await request(app)
        .get('/protected')
        .set('Authorization', `Bearer ${tamperedToken}`);

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('Invalid or expired token');
    });

    it('should return 401 for token with missing id claim', async () => {
      const token = jwt.sign(
        { role: 'member' },
        process.env.JWT_SECRET,
        { expiresIn: '1h' }
      );

      const response = await request(app)
        .get('/protected')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('Invalid or expired token');
    });

    it('should return 401 for token that is just random string', async () => {
      const response = await request(app)
        .get('/protected')
        .set('Authorization', 'Bearer randomStringThatIsNotAJWT');

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('Invalid or expired token');
    });

    it('should return 401 for empty token string', async () => {
      const response = await request(app)
        .get('/protected')
        .set('Authorization', 'Bearer');

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('You need to log in first');
    });
  });

  describe('Edge Cases', () => {
    it('should handle very long tokens gracefully', async () => {
      const response = await request(app)
        .get('/protected')
        .set('Authorization', `Bearer ${'a'.repeat(10000)}`);

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('Invalid or expired token');
    });

    it('should handle tokens with special characters', async () => {
      const token = jwt.sign(
        { id: 'user-with-ñöá', role: 'member' },
        process.env.JWT_SECRET,
        { expiresIn: '1h' }
      );

      const response = await request(app)
        .get('/protected')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.userId).toBe('user-with-ñöá');
    });

    it('should handle multiple Authorization headers (use first)', async () => {
      const token1 = jwt.sign(
        { id: 'user-1', role: 'member' },
        process.env.JWT_SECRET,
        { expiresIn: '1h' }
      );

      const token2 = jwt.sign(
        { id: 'user-2', role: 'admin' },
        process.env.JWT_SECRET,
        { expiresIn: '1h' }
      );

      // Express uses the first value when multiple headers exist
      const response = await request(app)
        .get('/protected')
        .set('Authorization', [`Bearer ${token1}`, `Bearer ${token2}`]);

      expect(response.status).toBe(200);
      expect(response.body.userId).toBe('user-1');
    });

    it('should work with different HTTP methods', async () => {
      const token = jwt.sign(
        { id: 'test-user', role: 'member' },
        process.env.JWT_SECRET,
        { expiresIn: '1h' }
      );

      // Add POST route with same middleware
      app.post('/protected', authenticate, (req, res) => {
        res.json({ message: 'POST success', userId: req.userId });
      });

      // Add PUT route
      app.put('/protected', authenticate, (req, res) => {
        res.json({ message: 'PUT success', userId: req.userId });
      });

      // Add DELETE route
      app.delete('/protected', authenticate, (req, res) => {
        res.json({ message: 'DELETE success', userId: req.userId });
      });

      const methods = ['get', 'post', 'put', 'delete'];
      for (const method of methods) {
        const response = await request(app)[method]('/protected')
          .set('Authorization', `Bearer ${token}`);

        expect(response.status).toBe(200);
        expect(response.body.userId).toBe('test-user');
      }
    });

    it('should handle concurrent requests with different tokens', async () => {
      const token1 = jwt.sign(
        { id: 'concurrent-user-1', role: 'member' },
        process.env.JWT_SECRET,
        { expiresIn: '1h' }
      );

      const token2 = jwt.sign(
        { id: 'concurrent-user-2', role: 'admin' },
        process.env.JWT_SECRET,
        { expiresIn: '1h' }
      );

      const requests = [
        request(app).get('/protected').set('Authorization', `Bearer ${token1}`),
        request(app).get('/protected').set('Authorization', `Bearer ${token2}`),
        request(app).get('/protected').set('Authorization', `Bearer ${token1}`),
      ];

      const responses = await Promise.all(requests);

      expect(responses[0].body.userId).toBe('concurrent-user-1');
      expect(responses[1].body.userId).toBe('concurrent-user-2');
      expect(responses[2].body.userId).toBe('concurrent-user-1');
    });

    it('should handle tokens with audience claim', async () => {
      const token = jwt.sign(
        { id: 'aud-user', role: 'member' },
        process.env.JWT_SECRET,
        { audience: 'test-audience', expiresIn: '1h' }
      );

      const response = await request(app)
        .get('/protected')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
    });

    it('should handle tokens with issuer claim', async () => {
      const token = jwt.sign(
        { id: 'issuer-user', role: 'member' },
        process.env.JWT_SECRET,
        { issuer: 'test-issuer', expiresIn: '1h' }
      );

      const response = await request(app)
        .get('/protected')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
    });
  });

  describe('Role-based Authorization', () => {
    it('should deny non-admin users from admin-only routes', async () => {
      const token = jwt.sign(
        { id: 'regular-member', role: 'member' },
        process.env.JWT_SECRET,
        { expiresIn: '1h' }
      );

      const response = await request(app)
        .get('/admin-only')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(403);
      expect(response.body.error).toBe('Admin access required');
    });

    it('should deny users from accessing other users data', async () => {
      const token = jwt.sign(
        { id: 'user-a', role: 'member' },
        process.env.JWT_SECRET,
        { expiresIn: '1h' }
      );

      const response = await request(app)
        .get('/user/user-b')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(403);
      expect(response.body.error).toBe('Cannot access another user data');
    });

    it('should handle token with no role claim', async () => {
      const token = jwt.sign(
        { id: 'no-role-user' },
        process.env.JWT_SECRET,
        { expiresIn: '1h' }
      );

      const response = await request(app)
        .get('/admin-only')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(403);
    });
  });

  describe('Middleware Execution Order', () => {
    it('should call next() and pass control to route handler', async () => {
      let middlewareCalled = false;
      let handlerCalled = false;

      const testApp = express();
      testApp.use(express.json());

      testApp.get('/order-test', (req, res, next) => {
        middlewareCalled = true;
        // Manually test the authenticate middleware
        const token = jwt.sign(
          { id: 'test-user', role: 'member' },
          process.env.JWT_SECRET,
          { expiresIn: '1h' }
        );
        req.headers.authorization = `Bearer ${token}`;
        next();
      }, authenticate, (req, res) => {
        handlerCalled = true;
        res.json({ success: true });
      });

      const response = await request(testApp)
        .get('/order-test');

      expect(response.status).toBe(200);
      expect(middlewareCalled).toBe(true);
      expect(handlerCalled).toBe(true);
    });
  });
});