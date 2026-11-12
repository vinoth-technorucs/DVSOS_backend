const prisma = require('../../config/db');
const { STATUS_MODULE_CODES, statusModuleFilter } = require('../../common/utils/status.util');

const list = async (query, user) => {
  const page = Number(query.page) || 1;
  const limit = Number(query.limit) || 10;
  const skip = (page - 1) * limit;

  const where = {};

  if (user && user.locationId) {
    where.locationId = Number(user.locationId);
  }

  if (query.search) {
    where.OR = [
      { vehicle: { registrationNo: { contains: query.search } } },
      { customer: { fullName: { contains: query.search } } },
      { customer: { mobileNo: { contains: query.search } } }
    ];
  }

  if (query.status) {
    where.status = {
      is: {
        statusCode: String(query.status).trim().toUpperCase(),
        ...statusModuleFilter(STATUS_MODULE_CODES.GATE_ENTRY)
      }
    };
  }

  if (query.serviceType) {
    where.entryType = query.serviceType;
  }

  if (query.startDate && query.endDate) {
    where.entryTime = {
      gte: new Date(query.startDate),
      lte: new Date(query.endDate + 'T23:59:59.999Z')
    };
  } else if (query.startDate) {
    where.entryTime = {
      gte: new Date(query.startDate)
    };
  } else if (query.endDate) {
    where.entryTime = {
      lte: new Date(query.endDate + 'T23:59:59.999Z')
    };
  }

  if (query.assignedAdvisorId) {
    where.assignedAdvisorId = Number(query.assignedAdvisorId);
  } else if (query.scope === 'my' && user?.userId) {
    where.assignedAdvisorId = Number(user.userId);
  } else if (query.scope === 'unassigned') {
    where.assignedAdvisorId = null;
  }

  const isExport = query.export === 'true';

  const [entries, total] = await Promise.all([
    prisma.gateEntry.findMany({
      where,
      ...(isExport ? {} : { skip, take: limit }),
      orderBy: { entryTime: 'desc' },
      include: {
        vehicle: {
          include: {
            brand: true
          }
        },
        customer: true,
        status: true,
        enteredBy: true,
        assignedAdvisor: {
          select: {
            id: true,
            fullName: true,
            emailId: true
          }
        },
        jobCards: {
          select: {
            id: true,
            jobCardNo: true,
            currentStatus: {
              select: {
                statusCode: true,
                statusName: true
              }
            }
          }
        }
      }
    }),
    prisma.gateEntry.count({ where })
  ]);

  const formattedEntries = entries.map(entry => {
    const isExited = entry.status?.statusCode === 'EXITED' || entry.status?.statusCode === 'CLOSED' || Boolean(entry.exitTime);
    const linkedJobCards = entry.jobCards || [];
    const hasJobCards = linkedJobCards.length > 0;
    const isEnquiry = entry.entryType === 'ENQUIRY';

    let paymentStatus = 'N/A';
    let canExit = true;

    if (isExited) {
      canExit = false;
    } else if (isEnquiry) {
      paymentStatus = 'N/A';
      canExit = true;
    } else if (hasJobCards) {
      const allPaid = linkedJobCards.every(
        (jc) => jc.currentStatus?.statusCode === 'PAYMENT_DONE' || jc.currentStatus?.statusCode === 'DELIVERED'
      );
      paymentStatus = allPaid ? 'PAYMENT_DONE' : 'PAYMENT_PENDING';
      canExit = allPaid;
    } else {
      paymentStatus = 'PAYMENT_PENDING';
      canExit = false;
    }

    return {
      id: entry.id.toString(),
      slug: entry.slug,
      vehicleNumber: entry.vehicle?.registrationNo || '',
      ownerName: entry.customer?.fullName || '',
      mobile: entry.customer?.mobileNo || '',
      makeModel: entry.vehicle?.model ? `${entry.vehicle?.brand?.name || ''} ${entry.vehicle?.model}`.trim() : (entry.vehicle?.brand?.name || 'Unknown'),
      serviceType: entry.entryType,
      status: entry.status?.statusCode || 'PENDING',
      entryTime: entry.entryTime,
      exitTime: entry.exitTime,
      entryBy: entry.enteredBy?.fullName || 'System',
      assignedAdvisor: entry.assignedAdvisor ? {
        id: entry.assignedAdvisor.id,
        fullName: entry.assignedAdvisor.fullName
      } : null,
      assignedAdvisorName: entry.assignedAdvisor?.fullName || 'Unassigned',
      jobCards: linkedJobCards.map((jc) => ({
        id: jc.id,
        jobCardNo: jc.jobCardNo,
        status: jc.currentStatus?.statusCode || null,
        statusName: jc.currentStatus?.statusName || null,
      })),
      paymentStatus,
      canExit
    };
  });

  return {
    entries: formattedEntries,
    meta: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    }
  };
};

const getBySlug = async (slugOrId, user) => {
  const isNumeric = /^\d+$/.test(slugOrId);
  const entry = await prisma.gateEntry.findFirst({
    where: {
      OR: [
        { slug: slugOrId },
        ...(isNumeric ? [{ id: parseInt(slugOrId) }] : [])
      ]
    },
    include: {
      vehicle: { include: { brand: true } },
      customer: true,
      status: true,
      enteredBy: true,
      location: true,
      jobCards: {
        select: {
          id: true,
          jobCardNo: true,
          currentStatus: {
            select: {
              statusCode: true,
              statusName: true
            }
          }
        }
      }
    }
  });

  if (!entry) throw new Error('Gate entry not found');

  const isExited = entry.status?.statusCode === 'EXITED' || entry.status?.statusCode === 'CLOSED' || Boolean(entry.exitTime);
  const linkedJobCards = entry.jobCards || [];
  const hasJobCards = linkedJobCards.length > 0;
  const isEnquiry = entry.entryType === 'ENQUIRY';

  let paymentStatus = 'N/A';
  let canExit = true;

  if (isExited) {
    canExit = false;
  } else if (isEnquiry) {
    paymentStatus = 'N/A';
    canExit = true;
  } else if (hasJobCards) {
    const allPaid = linkedJobCards.every(
      (jc) => jc.currentStatus?.statusCode === 'PAYMENT_DONE' || jc.currentStatus?.statusCode === 'DELIVERED'
    );
    paymentStatus = allPaid ? 'PAYMENT_DONE' : 'PAYMENT_PENDING';
    canExit = allPaid;
  } else {
    paymentStatus = 'PAYMENT_PENDING';
    canExit = false;
  }

  return {
    id: entry.id.toString(),
    slug: entry.slug,
    vehicleNumber: entry.vehicle?.registrationNo || '',
    ownerName: entry.customer?.fullName || '',
    mobile: entry.customer?.mobileNo || '',
    makeModel: entry.vehicle?.model ? `${entry.vehicle?.brand?.name || ''} ${entry.vehicle?.model}`.trim() : (entry.vehicle?.brand?.name || 'Unknown'),
    serviceType: entry.entryType,
    status: entry.status?.statusCode || 'PENDING',
    entryTime: entry.entryTime,
    exitTime: entry.exitTime,
    entryBy: entry.enteredBy?.fullName || 'System',
    remarks: entry.remarks,
    jobCards: linkedJobCards.map((jc) => ({
      id: jc.id,
      jobCardNo: jc.jobCardNo,
      status: jc.currentStatus?.statusCode || null,
      statusName: jc.currentStatus?.statusName || null,
    })),
    paymentStatus,
    canExit
  };
};

const mobileGateEntryService = require('../mobileGateEntry/mobileGateEntry.service');

const submitExit = async (gateEntryId, payload, user) => {
  return mobileGateEntryService.submitExit(Number(gateEntryId), payload, user);
};

module.exports = { list, getBySlug, submitExit };
