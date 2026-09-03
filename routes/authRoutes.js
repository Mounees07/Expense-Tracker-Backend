const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const { register, login, getMe, updateTheme, updateStatementSettings, forgotPassword, resetPassword } = require('../controllers/authController');
const { protect } = require('../middleware/auth');

const registerValidation = [
  body('name').trim().isLength({ min: 2 }).withMessage('Name must be at least 2 characters'),
  body('email').isEmail().normalizeEmail().withMessage('Enter a valid email'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
];

const loginValidation = [
  body('email').isEmail().normalizeEmail().withMessage('Enter a valid email'),
  body('password').notEmpty().withMessage('Password is required'),
];

const forgotPasswordValidation = [
  body('email').isEmail().normalizeEmail().withMessage('Enter a valid email'),
];

const resetPasswordValidation = [
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
];

const statementSettingsValidation = [
  body('statementSchedule').isIn(['off', 'daily', 'weekly', 'monthly']).withMessage('Invalid statement schedule'),
];

router.post('/register', registerValidation, register);
router.post('/login', loginValidation, login);
router.get('/me', protect, getMe);
router.patch('/theme', protect, updateTheme);
router.patch('/statement-settings', protect, statementSettingsValidation, updateStatementSettings);
router.post('/forgot-password', forgotPasswordValidation, forgotPassword);
router.post('/reset-password/:token', resetPasswordValidation, resetPassword);

module.exports = router;
