const router = require('express').Router();
const controller = require('./webGateEntries.controller');
const { authMiddleware } = require('../../common/middleware/auth.middleware');
const { permissionMiddleware } = require('../../common/middleware/permission.middleware');

const canReadGateEntries = permissionMiddleware('/gate-entry', 'canRead');
const canUpdateGateEntries = permissionMiddleware('/gate-entry', 'canUpdate');

router.use(authMiddleware);

router.get('/list', canReadGateEntries, controller.list);
router.get('/view/:slug', canReadGateEntries, controller.getBySlug);
router.put('/exit/:id', canUpdateGateEntries, controller.submitExit);

module.exports = router;
