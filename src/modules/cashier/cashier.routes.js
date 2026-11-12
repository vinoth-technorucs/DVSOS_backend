const router = require('express').Router();
const cashierController = require('./cashier.controller');
const { validateMarkAsPaid } = require('./cashier.validation');
const { authenticate } = require('../../common/middleware/auth.middleware');
const { permissionMiddleware } = require('../../common/middleware/permission.middleware');

const canReadCashier = permissionMiddleware({
  menuPaths: ['/cashier-dashboard', '/cashier/pending-payments', '/cashier/payment-history'],
  action: 'canRead'
});
const canUpdateCashier = permissionMiddleware({
  menuPaths: ['/cashier/pending-payments', '/cashier-dashboard'],
  action: 'canUpdate'
});

router.use(authenticate);

router.get('/dashboard-stats', canReadCashier, cashierController.getDashboardStats);
router.get('/pending-payments', canReadCashier, cashierController.getPendingPayments);
router.get('/payment-history', canReadCashier, cashierController.getPaymentHistory);
router.get('/job-cards/:jobCardId', canReadCashier, cashierController.getJobCardDetail);
router.patch('/job-cards/:jobCardId/mark-paid', canUpdateCashier, validateMarkAsPaid, cashierController.markAsPaid);

module.exports = router;
