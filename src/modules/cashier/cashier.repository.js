const prisma = require('../../config/db');
const { STATUS_MODULE_CODES, statusModuleFilter } = require('../../common/utils/status.util');

const JOB_CARD_INCLUDE = {
  vehicle: { include: { brand: true } },
  customer: true,
  currentStatus: true,
  gateEntry: true,
  services: {
    include: {
      serviceItem: { include: { category: true } },
      serviceStatus: true
    }
  }
};

const findPendingPayments = async (locationId, query) => {
  const page = Number(query.page) || 1;
  const limit = Number(query.limit) || 20;
  const skip = (page - 1) * limit;

  const where = {
    ...(locationId ? { locationId: Number(locationId) } : {}),
    currentStatus: {
      statusCode: 'PAYMENT_PENDING',
      ...statusModuleFilter(STATUS_MODULE_CODES.JOB_CARD_STATUS)
    }
  };

  if (query.search) {
    where.OR = [
      { vehicle: { registrationNo: { contains: query.search } } },
      { customer: { fullName: { contains: query.search } } },
      { customer: { mobileNo: { contains: query.search } } }
    ];
  }

  const [jobCards, total] = await Promise.all([
    prisma.jobCard.findMany({
      where,
      skip,
      take: limit,
      orderBy: { updatedAt: 'desc' },
      include: JOB_CARD_INCLUDE
    }),
    prisma.jobCard.count({ where })
  ]);

  return { jobCards, total, page, limit };
};

const findPaymentHistory = async (locationId, query) => {
  const page = Number(query.page) || 1;
  const limit = Number(query.limit) || 20;
  const skip = (page - 1) * limit;

  const where = {
    ...(locationId ? { locationId: Number(locationId) } : {}),
    paymentDoneAt: { not: null }
  };

  if (query.search) {
    where.OR = [
      { vehicle: { registrationNo: { contains: query.search } } },
      { customer: { fullName: { contains: query.search } } }
    ];
  }

  if (query.paymentMode) {
    where.paymentMode = query.paymentMode.toUpperCase();
  }

  if (query.startDate && query.endDate) {
    where.paymentDoneAt = {
      gte: new Date(query.startDate),
      lte: new Date(query.endDate + 'T23:59:59.999Z')
    };
  } else if (query.startDate) {
    where.paymentDoneAt = { gte: new Date(query.startDate) };
  } else if (query.endDate) {
    where.paymentDoneAt = { lte: new Date(query.endDate + 'T23:59:59.999Z') };
  }

  const [jobCards, total] = await Promise.all([
    prisma.jobCard.findMany({
      where,
      skip,
      take: limit,
      orderBy: { paymentDoneAt: 'desc' },
      include: JOB_CARD_INCLUDE
    }),
    prisma.jobCard.count({ where })
  ]);

  return { jobCards, total, page, limit };
};

const findJobCardById = async (jobCardId, locationId) => {
  return prisma.jobCard.findFirst({
    where: {
      id: Number(jobCardId),
      ...(locationId ? { locationId: Number(locationId) } : {})
    },
    include: JOB_CARD_INCLUDE
  });
};

const markJobCardPaid = async (jobCardId, paymentStatusId, paymentMode, paidAmount) => {
  return prisma.jobCard.update({
    where: { id: Number(jobCardId) },
    data: {
      currentStatusId: paymentStatusId,
      paymentMode: paymentMode.toUpperCase(),
      paidAmount: Number(paidAmount),
      paymentDoneAt: new Date()
    },
    include: JOB_CARD_INCLUDE
  });
};

const getDashboardStats = async (locationId) => {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  const locationFilter = locationId ? { locationId: Number(locationId) } : {};

  const pendingWhere = {
    ...locationFilter,
    currentStatus: {
      statusCode: 'PAYMENT_PENDING',
      ...statusModuleFilter(STATUS_MODULE_CODES.JOB_CARD_STATUS)
    }
  };

  const todayPaidWhere = {
    ...locationFilter,
    paymentDoneAt: { gte: todayStart, lte: todayEnd }
  };

  const [
    pendingCount,
    pendingSumResult,
    paidTodayCount,
    revenueTodayResult,
    recentPending,
    recentPaid
  ] = await Promise.all([
    prisma.jobCard.count({ where: pendingWhere }),
    prisma.jobCard.aggregate({
      where: pendingWhere,
      _sum: { finalAmount: true, totalEstimate: true }
    }),
    prisma.jobCard.count({ where: todayPaidWhere }),
    prisma.jobCard.aggregate({
      where: todayPaidWhere,
      _sum: { paidAmount: true }
    }),
    prisma.jobCard.findMany({
      where: pendingWhere,
      take: 6,
      orderBy: { updatedAt: 'desc' },
      include: JOB_CARD_INCLUDE
    }),
    prisma.jobCard.findMany({
      where: todayPaidWhere,
      take: 6,
      orderBy: { paymentDoneAt: 'desc' },
      include: JOB_CARD_INCLUDE
    })
  ]);

  const pendingAmount = Number(pendingSumResult._sum.finalAmount || pendingSumResult._sum.totalEstimate || 0);

  return {
    pendingPayments: pendingCount,
    pendingAmount,
    paidToday: paidTodayCount,
    revenueToday: Number(revenueTodayResult._sum.paidAmount || 0),
    recentPending,
    recentPaid
  };
};

module.exports = {
  findPendingPayments,
  findPaymentHistory,
  findJobCardById,
  markJobCardPaid,
  getDashboardStats
};
