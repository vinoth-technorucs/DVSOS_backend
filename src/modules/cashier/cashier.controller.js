const cashierService = require('./cashier.service');
const { apiResponse } = require('../../common/utils/apiResponse');

const getPendingPayments = async (req, res, next) => {
  try {
    const result = await cashierService.listPendingPayments(req.user, req.query);

    return apiResponse(res, {
      statusCode: 200,
      success: true,
      message: 'Pending payments retrieved successfully',
      data: result.jobCards,
      meta: result.meta
    });
  } catch (error) {
    return next(error);
  }
};

const getPaymentHistory = async (req, res, next) => {
  try {
    const result = await cashierService.listPaymentHistory(req.user, req.query);

    return apiResponse(res, {
      statusCode: 200,
      success: true,
      message: 'Payment history retrieved successfully',
      data: result.jobCards,
      meta: result.meta
    });
  } catch (error) {
    return next(error);
  }
};

const getJobCardDetail = async (req, res, next) => {
  try {
    const jobCard = await cashierService.getJobCardDetail(req.params.jobCardId, req.user);

    return apiResponse(res, {
      statusCode: 200,
      success: true,
      message: 'Job card retrieved successfully',
      data: jobCard
    });
  } catch (error) {
    if (error.statusCode === 404) {
      return apiResponse(res, { statusCode: 404, success: false, message: error.message });
    }
    return next(error);
  }
};

const markAsPaid = async (req, res, next) => {
  try {
    const jobCard = await cashierService.processPayment(req.params.jobCardId, req.body, req.user);

    return apiResponse(res, {
      statusCode: 200,
      success: true,
      message: 'Payment recorded successfully',
      data: jobCard
    });
  } catch (error) {
    if (error.statusCode === 400 || error.statusCode === 404) {
      return apiResponse(res, { statusCode: error.statusCode, success: false, message: error.message });
    }
    return next(error);
  }
};

const getDashboardStats = async (req, res, next) => {
  try {
    const stats = await cashierService.getDashboardStats(req.user);

    return apiResponse(res, {
      statusCode: 200,
      success: true,
      message: 'Dashboard stats retrieved successfully',
      data: stats
    });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  getPendingPayments,
  getPaymentHistory,
  getJobCardDetail,
  markAsPaid,
  getDashboardStats
};
