const cashierRepository = require('./cashier.repository');
const { resolveOrEnsureStatus } = require('../../common/utils/status.util');
const { STATUS_MODULE_CODES } = require('../../common/constants/status.constants');
const prisma = require('../../config/db');

const VALID_PAYMENT_MODES = ['CASH', 'CARD', 'UPI', 'ONLINE'];

const createHttpError = (statusCode, message) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const listPendingPayments = async (user, query) => {
  const { jobCards, total, page, limit } = await cashierRepository.findPendingPayments(user.locationId, query);

  return {
    jobCards: jobCards.map(formatJobCard),
    meta: { total, page, limit, totalPages: Math.ceil(total / limit) }
  };
};

const listPaymentHistory = async (user, query) => {
  const { jobCards, total, page, limit } = await cashierRepository.findPaymentHistory(user.locationId, query);

  return {
    jobCards: jobCards.map(formatJobCard),
    meta: { total, page, limit, totalPages: Math.ceil(total / limit) }
  };
};

const getJobCardDetail = async (jobCardId, user) => {
  const jobCard = await cashierRepository.findJobCardById(jobCardId, user.locationId);

  if (!jobCard) {
    throw createHttpError(404, 'Job card not found');
  }

  return formatJobCard(jobCard);
};

const processPayment = async (jobCardId, payload, user) => {
  const { paymentMode, paidAmount } = payload;

  if (!VALID_PAYMENT_MODES.includes(String(paymentMode || '').toUpperCase())) {
    throw createHttpError(400, `Payment mode must be one of: ${VALID_PAYMENT_MODES.join(', ')}`);
  }

  const jobCard = await cashierRepository.findJobCardById(jobCardId, user.locationId);

  if (!jobCard) {
    throw createHttpError(404, 'Job card not found');
  }

  const currentStatusCode = jobCard.currentStatus?.statusCode;
  if (currentStatusCode !== 'PAYMENT_PENDING') {
    throw createHttpError(400, `Payment can only be processed for job cards with PAYMENT_PENDING status. Current status: ${currentStatusCode}`);
  }

  const paymentDoneStatus = await prisma.$transaction(async (tx) => {
    return resolveOrEnsureStatus(tx, STATUS_MODULE_CODES.JOB_CARD_STATUS, 'PAYMENT_DONE', 'Payment Completed', 85);
  });

  if (!paymentDoneStatus) {
    throw createHttpError(500, 'Payment Done status is not configured in the system');
  }

  const finalAmount = paidAmount !== undefined ? Number(paidAmount) : Number(jobCard.finalAmount || jobCard.totalEstimate || 0);

  const updated = await cashierRepository.markJobCardPaid(jobCardId, paymentDoneStatus.id, paymentMode, finalAmount);

  return formatJobCard(updated);
};

const getDashboardStats = async (user) => {
  const stats = await cashierRepository.getDashboardStats(user.locationId);
  return {
    pendingPayments: stats.pendingPayments,
    pendingAmount: stats.pendingAmount,
    paidToday: stats.paidToday,
    revenueToday: stats.revenueToday,
    recentPending: (stats.recentPending || []).map(formatJobCard),
    recentPaid: (stats.recentPaid || []).map(formatJobCard)
  };
};

const formatJobCard = (jobCard) => {
  const validServices = (jobCard.services || []).filter(
    (s) => s.serviceStatus?.statusCode !== 'REJECTED'
  );

  const calculatedSubtotal = validServices.reduce(
    (acc, s) => acc + Number(s.price || 0) * (s.quantity || 1),
    0
  );

  const serviceSubtotal = jobCard.serviceSubtotal !== null && jobCard.serviceSubtotal !== undefined
    ? Number(jobCard.serviceSubtotal)
    : calculatedSubtotal;

  const taxRate = Number(jobCard.taxRate || 0);
  const discountAmount = Number(jobCard.discountAmount || 0);
  const taxAmount = jobCard.taxAmount !== null && jobCard.taxAmount !== undefined
    ? Number(jobCard.taxAmount)
    : Number(((serviceSubtotal - discountAmount) * (taxRate / 100)).toFixed(2));

  const finalAmount = jobCard.finalAmount !== null && jobCard.finalAmount !== undefined
    ? Number(jobCard.finalAmount)
    : (jobCard.totalEstimate !== null && jobCard.totalEstimate !== undefined && Number(jobCard.totalEstimate) > 0
        ? Number(jobCard.totalEstimate)
        : Number((serviceSubtotal - discountAmount + taxAmount).toFixed(2)));

  return {
    id: jobCard.id,
    jobCardNo: jobCard.jobCardNo,
    slug: jobCard.slug,
    vehicle: {
      registrationNo: jobCard.vehicle?.registrationNo || '',
      model: jobCard.vehicle?.model || '',
      brand: jobCard.vehicle?.brand?.name || '',
      makeModel: jobCard.vehicle?.model
        ? `${jobCard.vehicle?.brand?.name || ''} ${jobCard.vehicle.model}`.trim()
        : (jobCard.vehicle?.brand?.name || 'Unknown')
    },
    customer: {
      fullName: jobCard.customer?.fullName || '',
      mobileNo: jobCard.customer?.mobileNo || ''
    },
    currentStatus: jobCard.currentStatus?.statusCode || null,
    totalEstimate: Number(jobCard.totalEstimate || 0),
    serviceSubtotal,
    taxRate,
    taxAmount,
    discountAmount,
    finalAmount,
    paymentMode: jobCard.paymentMode || null,
    paidAmount: jobCard.paidAmount ? Number(jobCard.paidAmount) : null,
    paymentDoneAt: jobCard.paymentDoneAt || null,
    services: (jobCard.services || []).map((s) => ({
      id: s.id,
      serviceName: s.serviceName,
      price: Number(s.price),
      quantity: s.quantity,
      isAdditional: s.isAdditional,
      status: s.serviceStatus?.statusCode || null
    })),
    createdAt: jobCard.createdAt,
    updatedAt: jobCard.updatedAt
  };
};

module.exports = {
  listPendingPayments,
  listPaymentHistory,
  getJobCardDetail,
  processPayment,
  getDashboardStats
};
