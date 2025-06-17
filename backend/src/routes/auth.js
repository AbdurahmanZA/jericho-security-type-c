/**
 * Authentication Routes
 * Handles user login, registration, token refresh, and logout
 */

import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { AuthMiddleware } from '../middleware/auth.js';
import { ValidationMiddleware } from '../middleware/validation.js';
import { ErrorHandler } from '../middleware/error-handler.js';

const router = express.Router();

/**
 * POST /api/auth/login
 * User login with username/email and password
 */
router.post('/login', 
  ValidationMiddleware.validateLogin,
  ErrorHandler.asyncHandler(async (req, res) => {
    const { username, password } = req.body;
    const { db, cache, logger } = req.app.locals.services;
    
    // Find user by username or email
    let user = await db.getUserByUsername(username);
    if (!user) {
      user = await db.getUserByEmail(username);
    }
    
    if (!user) {
      logger.warn(`Login attempt with invalid username: ${username}`);
      return res.status(401).json({
        error: 'Invalid credentials',
        code: 'INVALID_CREDENTIALS',
      });
    }
    
    // Check if account is locked
    if (user.locked_until && new Date() < new Date(user.locked_until)) {
      const lockTimeRemaining = Math.ceil((new Date(user.locked_until) - new Date()) / 1000 / 60);
      return res.status(423).json({
        error: `Account locked. Try again in ${lockTimeRemaining} minutes.`,
        code: 'ACCOUNT_LOCKED',
        lockTimeRemaining,
      });
    }
    
    // Verify password
    const validPassword = await bcrypt.compare(password, user.password_hash);
    
    if (!validPassword) {
      // Increment failed attempts
      const failedAttempts = (user.failed_login_attempts || 0) + 1;
      const maxAttempts = parseInt(process.env.MAX_FAILED_ATTEMPTS) || 5;
      
      if (failedAttempts >= maxAttempts) {
        // Lock account for 30 minutes
        const lockUntil = new Date(Date.now() + 30 * 60 * 1000);
        await db.query(
          'UPDATE users SET failed_login_attempts = $1, locked_until = $2 WHERE id = $3',
          [failedAttempts, lockUntil, user.id]
        );
        
        logger.warn(`Account locked for user ${user.username} after ${failedAttempts} failed attempts`);
        
        return res.status(423).json({
          error: 'Account locked due to too many failed login attempts',
          code: 'ACCOUNT_LOCKED',
          lockTimeRemaining: 30,
        });
      } else {
        await db.query(
          'UPDATE users SET failed_login_attempts = $1 WHERE id = $2',
          [failedAttempts, user.id]
        );
      }
      
      logger.warn(`Invalid password for user ${user.username}. Failed attempts: ${failedAttempts}`);
      
      return res.status(401).json({
        error: 'Invalid credentials',
        code: 'INVALID_CREDENTIALS',
        attemptsRemaining: maxAttempts - failedAttempts,
      });
    }
    
    // Reset failed attempts on successful login
    await db.query(
      'UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE id = $1',
      [user.id]
    );
    
    // Generate tokens
    const jwtSecret = process.env.JWT_SECRET;
    const jwtRefreshSecret = process.env.JWT_REFRESH_SECRET;
    
    const accessToken = jwt.sign(
      {
        userId: user.id,
        username: user.username,
        role: user.role,
      },
      jwtSecret,
      { expiresIn: process.env.JWT_EXPIRES_IN || '15m' }
    );
    
    const refreshToken = jwt.sign(
      {
        userId: user.id,
        sessionId: uuidv4(),
      },
      jwtRefreshSecret,
      { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d' }
    );
    
    // Store refresh token session
    const refreshTokenHash = await bcrypt.hash(refreshToken, 10);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
    
    await db.query(`
      INSERT INTO user_sessions (user_id, refresh_token_hash, expires_at, ip_address, user_agent)
      VALUES ($1, $2, $3, $4, $5)
    `, [
      user.id,
      refreshTokenHash,
      expiresAt,
      req.ip,
      req.get('User-Agent')
    ]);
    
    // Update last login timestamp
    await db.updateUserLastLogin(user.id);
    
    // Cache user session
    await cache.setSession(`user:${user.id}`, {
      id: user.id,
      username: user.username,
      role: user.role,
      loginTime: new Date().toISOString(),
    });
    
    logger.info(`User ${user.username} logged in successfully`);
    
    res.json({
      message: 'Login successful',
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        firstName: user.first_name,
        lastName: user.last_name,
      },
      tokens: {
        accessToken,
        refreshToken,
        expiresIn: process.env.JWT_EXPIRES_IN || '15m',
      },
    });
  })
);

/**
 * POST /api/auth/register
 * User registration (admin only)
 */
router.post('/register',
  AuthMiddleware.authenticate,
  AuthMiddleware.authorize(['admin', 'superadmin']),
  ValidationMiddleware.validateRegister,
  ErrorHandler.asyncHandler(async (req, res) => {
    const { username, email, password, firstName, lastName, role = 'viewer' } = req.body;
    const { db, logger } = req.app.locals.services;
    
    // Check if username or email already exists
    const existingUser = await db.getUserByUsername(username) || await db.getUserByEmail(email);
    
    if (existingUser) {
      return res.status(409).json({
        error: 'Username or email already exists',
        code: 'USER_EXISTS',
      });
    }
    
    // Hash password
    const saltRounds = parseInt(process.env.BCRYPT_ROUNDS) || 12;
    const passwordHash = await bcrypt.hash(password, saltRounds);
    
    // Create user
    const newUser = await db.createUser({
      username,
      email,
      passwordHash,
      role,
      firstName,
      lastName,
    });
    
    logger.info(`New user ${username} registered by ${req.user.username}`);
    
    res.status(201).json({
      message: 'User registered successfully',
      user: newUser,
    });
  })
);

/**
 * POST /api/auth/refresh
 * Refresh access token using refresh token
 */
router.post('/refresh',
  ValidationMiddleware.validateRefreshToken,
  ErrorHandler.asyncHandler(async (req, res) => {
    const { refreshToken } = req.body;
    const { db, logger } = req.app.locals.services;
    
    try {
      // Verify refresh token
      const jwtRefreshSecret = process.env.JWT_REFRESH_SECRET;
      const decoded = jwt.verify(refreshToken, jwtRefreshSecret);
      
      // Check if session exists and is valid
      const sessions = await db.query(`
        SELECT * FROM user_sessions 
        WHERE user_id = $1 AND active = true AND expires_at > NOW()
      `, [decoded.userId]);
      
      let validSession = null;
      
      // Check refresh token hash against stored sessions
      for (const session of sessions.rows) {
        const isValid = await bcrypt.compare(refreshToken, session.refresh_token_hash);
        if (isValid) {
          validSession = session;
          break;
        }
      }
      
      if (!validSession) {
        logger.warn(`Invalid refresh token for user ID ${decoded.userId}`);
        return res.status(401).json({
          error: 'Invalid refresh token',
          code: 'INVALID_REFRESH_TOKEN',
        });
      }
      
      // Get user details
      const user = await db.getUserById(decoded.userId);
      
      if (!user) {
        return res.status(401).json({
          error: 'User not found',
          code: 'USER_NOT_FOUND',
        });
      }
      
      // Generate new access token
      const jwtSecret = process.env.JWT_SECRET;
      const accessToken = jwt.sign(
        {
          userId: user.id,
          username: user.username,
          role: user.role,
        },
        jwtSecret,
        { expiresIn: process.env.JWT_EXPIRES_IN || '15m' }
      );
      
      logger.debug(`Access token refreshed for user ${user.username}`);
      
      res.json({
        message: 'Token refreshed successfully',
        tokens: {
          accessToken,
          expiresIn: process.env.JWT_EXPIRES_IN || '15m',
        },
      });
      
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        logger.warn('Expired refresh token used');
        return res.status(401).json({
          error: 'Refresh token expired',
          code: 'REFRESH_TOKEN_EXPIRED',
        });
      }
      
      if (error.name === 'JsonWebTokenError') {
        logger.warn('Invalid refresh token format');
        return res.status(401).json({
          error: 'Invalid refresh token',
          code: 'INVALID_REFRESH_TOKEN',
        });
      }
      
      throw error;
    }
  })
);

/**
 * POST /api/auth/logout
 * Logout user and invalidate tokens
 */
router.post('/logout',
  AuthMiddleware.authenticate,
  ErrorHandler.asyncHandler(async (req, res) => {
    const { db, cache, logger } = req.app.locals.services;
    const userId = req.user.id;
    const token = req.token;
    
    // Blacklist current access token
    const tokenExpiry = jwt.decode(token).exp;
    const ttl = tokenExpiry - Math.floor(Date.now() / 1000);
    
    if (ttl > 0) {
      await cache.set(`blacklist:${token}`, true, ttl);
    }
    
    // Deactivate all user sessions
    await db.query(
      'UPDATE user_sessions SET active = false WHERE user_id = $1',
      [userId]
    );
    
    // Clear user session cache
    await cache.del(`user:${userId}`);
    
    logger.info(`User ${req.user.username} logged out`);
    
    res.json({
      message: 'Logout successful',
    });
  })
);

/**
 * POST /api/auth/logout-all
 * Logout from all devices
 */
router.post('/logout-all',
  AuthMiddleware.authenticate,
  ErrorHandler.asyncHandler(async (req, res) => {
    const { db, cache, logger } = req.app.locals.services;
    const userId = req.user.id;
    
    // Deactivate all user sessions
    await db.query(
      'UPDATE user_sessions SET active = false WHERE user_id = $1',
      [userId]
    );
    
    // Clear user session cache
    await cache.del(`user:${userId}`);
    
    logger.info(`User ${req.user.username} logged out from all devices`);
    
    res.json({
      message: 'Logged out from all devices successfully',
    });
  })
);

/**
 * GET /api/auth/me
 * Get current user information
 */
router.get('/me',
  AuthMiddleware.authenticate,
  ErrorHandler.asyncHandler(async (req, res) => {
    const { db } = req.app.locals.services;
    
    // Get fresh user data from database
    const user = await db.getUserById(req.user.id);
    
    if (!user) {
      return res.status(404).json({
        error: 'User not found',
        code: 'USER_NOT_FOUND',
      });
    }
    
    res.json({
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        firstName: user.first_name,
        lastName: user.last_name,
        lastLogin: user.last_login,
        createdAt: user.created_at,
      },
    });
  })
);

/**
 * GET /api/auth/sessions
 * Get active user sessions
 */
router.get('/sessions',
  AuthMiddleware.authenticate,
  ErrorHandler.asyncHandler(async (req, res) => {
    const { db } = req.app.locals.services;
    const userId = req.user.id;
    
    const sessions = await db.query(`
      SELECT id, ip_address, user_agent, created_at, expires_at
      FROM user_sessions 
      WHERE user_id = $1 AND active = true AND expires_at > NOW()
      ORDER BY created_at DESC
    `, [userId]);
    
    res.json({
      sessions: sessions.rows,
    });
  })
);

/**
 * DELETE /api/auth/sessions/:sessionId
 * Revoke specific session
 */
router.delete('/sessions/:sessionId',
  AuthMiddleware.authenticate,
  ErrorHandler.asyncHandler(async (req, res) => {
    const { db, logger } = req.app.locals.services;
    const userId = req.user.id;
    const sessionId = req.params.sessionId;
    
    const result = await db.query(`
      UPDATE user_sessions 
      SET active = false 
      WHERE id = $1 AND user_id = $2
      RETURNING id
    `, [sessionId, userId]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'Session not found',
        code: 'SESSION_NOT_FOUND',
      });
    }
    
    logger.info(`Session ${sessionId} revoked by user ${req.user.username}`);
    
    res.json({
      message: 'Session revoked successfully',
    });
  })
);

export default router;