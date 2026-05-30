const express = require('express');
const { body } = require('express-validator');
const { protect } = require('../middleware/auth');
const {
  listResource,
  createResource,
  updateResource,
  deleteResource,
  getInsights,
  getMonthlyExpenseTarget,
  setMonthlyExpenseTarget,
} = require('../controllers/financeController');

const router = express.Router();

const allowedResources = ['accounts', 'budgets', 'goals', 'bills', 'recurring', 'notifications', 'receipts', 'reports'];

const validateResource = (req, res, next) => {
  if (!allowedResources.includes(req.params.resource)) {
    return res.status(404).json({ success: false, message: 'Resource not found' });
  }
  next();
};

router.use(protect);

router.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'Finance module routes are available',
    resources: allowedResources,
  });
});
router.get('/insights', getInsights);
router.get('/budget-target/monthly', getMonthlyExpenseTarget);
router.put('/budget-target/monthly', setMonthlyExpenseTarget);
router.get('/:resource', validateResource, listResource);
router.post('/:resource', validateResource, body().isObject(), createResource);
router.put('/:resource/:id', validateResource, body().isObject(), updateResource);
router.delete('/:resource/:id', validateResource, deleteResource);

module.exports = router;
