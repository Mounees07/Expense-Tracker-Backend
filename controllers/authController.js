const User = require('../models/User');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { validationResult } = require('express-validator');
const { sendEmail } = require('../config/email');

// Generate JWT token
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE || '7d',
  });
};

// @desc    Register user
// @route   POST /api/auth/register
// @access  Public
const register = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, message: errors.array()[0].msg });
    }

    const { name, email, password } = req.body;

    const existingUser = await User.findOne({ where: { email } });
    if (existingUser) {
      return res.status(400).json({ success: false, message: 'Email already registered' });
    }

    const user = await User.create({ name, email, password });
    const token = generateToken(user.id);

    res.status(201).json({
      success: true,
      message: 'Registration successful',
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role, themePreference: user.themePreference, statementSchedule: user.statementSchedule },
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Login user
// @route   POST /api/auth/login
// @access  Public
const login = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, message: errors.array()[0].msg });
    }

    const { email, password } = req.body;

    const user = await User.findOne({ where: { email } });
    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }

    const isMatch = await user.matchPassword(password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }

    const token = generateToken(user.id);

    res.json({
      success: true,
      message: 'Login successful',
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role, themePreference: user.themePreference, statementSchedule: user.statementSchedule },
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get current user
// @route   GET /api/auth/me
// @access  Private
const getMe = async (req, res) => {
  res.json({ success: true, user: { id: req.user.id, name: req.user.name, email: req.user.email, role: req.user.role, themePreference: req.user.themePreference, statementSchedule: req.user.statementSchedule } });
};

const updateTheme = async (req, res, next) => {
  try {
    const { themePreference } = req.body;
    if (!['light', 'dark'].includes(themePreference)) {
      return res.status(400).json({ success: false, message: 'Invalid theme preference' });
    }

    req.user.themePreference = themePreference;
    await req.user.save();

    res.json({
      success: true,
      user: { id: req.user.id, name: req.user.name, email: req.user.email, role: req.user.role, themePreference: req.user.themePreference },
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update the user's scheduled statement email preference
// @route   PATCH /api/auth/statement-settings
// @access  Private
const updateStatementSettings = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, message: errors.array()[0].msg });
    }

    const { statementSchedule } = req.body;

    req.user.statementSchedule = statementSchedule;
    await req.user.save();

    res.json({
      success: true,
      user: { id: req.user.id, name: req.user.name, email: req.user.email, role: req.user.role, themePreference: req.user.themePreference, statementSchedule: req.user.statementSchedule },
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Request a password reset email
// @route   POST /api/auth/forgot-password
// @access  Public
const forgotPassword = async (req, res, next) => {
  const genericMessage = { success: true, message: 'If an account exists for that email, a reset link has been sent.' };

  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, message: errors.array()[0].msg });
    }

    const { email } = req.body;
    const user = await User.findOne({ where: { email } });

    if (user) {
      const rawToken = crypto.randomBytes(32).toString('hex');
      const hashedToken = crypto.createHash('sha256').update(rawToken).digest('hex');

      user.resetPasswordToken = hashedToken;
      user.resetPasswordExpires = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes
      await user.save();

      const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/reset-password/${rawToken}`;

      try {
        await sendEmail({
          to: user.email,
          subject: 'Reset your ExpenseTracker password',
          html: `
            <p>Hi ${user.name || ''},</p>
            <p>You requested a password reset. Click the link below to set a new password. This link expires in 30 minutes.</p>
            <p><a href="${resetUrl}">${resetUrl}</a></p>
            <p>If you did not request this, you can safely ignore this email.</p>
          `,
        });
      } catch (emailError) {
        console.error('Failed to send password reset email:', emailError.message);
      }
    }

    return res.json(genericMessage);
  } catch (error) {
    next(error);
  }
};

// @desc    Reset password using a valid token
// @route   POST /api/auth/reset-password/:token
// @access  Public
const resetPassword = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, message: errors.array()[0].msg });
    }

    const { token } = req.params;
    const { password } = req.body;

    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    const user = await User.findOne({
      where: {
        resetPasswordToken: hashedToken,
        resetPasswordExpires: { [require('sequelize').Op.gt]: new Date() },
      },
    });

    if (!user) {
      return res.status(400).json({ success: false, message: 'Invalid or expired reset token' });
    }

    user.password = password;
    user.resetPasswordToken = null;
    user.resetPasswordExpires = null;
    await user.save();

    return res.json({ success: true, message: 'Password has been reset successfully. You can now sign in.' });
  } catch (error) {
    next(error);
  }
};

module.exports = { register, login, getMe, updateTheme, updateStatementSettings, forgotPassword, resetPassword };
