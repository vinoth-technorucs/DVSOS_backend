const { apiResponse } = require('../../common/utils/apiResponse');

const ALLOWED_PAYMENT_MODES = ['CASH', 'CARD', 'UPI', 'ONLINE'];

const validateMarkAsPaid = (req, res, next) => {
  const { paymentMode, paidAmount } = req.body || {};

  if (!paymentMode || typeof paymentMode !== 'string') {
    return apiResponse(res, {
      statusCode: 400,
      success: false,
      message: 'Payment mode is required'
    });
  }

  const normalizedMode = paymentMode.trim().toUpperCase();
  if (!ALLOWED_PAYMENT_MODES.includes(normalizedMode)) {
    return apiResponse(res, {
      statusCode: 400,
      success: false,
      message: `Payment mode must be one of: ${ALLOWED_PAYMENT_MODES.join(', ')}`
    });
  }

  if (paidAmount !== undefined && paidAmount !== null && paidAmount !== '') {
    const num = Number(paidAmount);
    if (isNaN(num) || num < 0) {
      return apiResponse(res, {
        statusCode: 400,
        success: false,
        message: 'Paid amount must be a non-negative number'
      });
    }
  }

  req.body.paymentMode = normalizedMode;
  return next();
};

module.exports = { validateMarkAsPaid };
