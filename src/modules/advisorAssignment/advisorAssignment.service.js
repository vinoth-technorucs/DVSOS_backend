const prisma = require('../../config/db');
const { getSocket } = require('../../config/socket');

const ADVISOR_ROLE_SLUGS = ['crm-team', 'crm_team', 'advisor', 'service-advisor', 'service_advisor'];

/**
 * Get start of current day (00:00:00.000)
 */
const getStartOfToday = () => {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return now;
};

/**
 * Assign next advisor for the given location using persistent round-robin.
 * Only advisors who have logged in today (lastLoginAt >= startOfToday) are eligible.
 *
 * @param {Object} params
 * @param {number} params.locationId
 * @param {Object} [params.tx] Optional prisma transaction client
 * @returns {Promise<Object|null>} The assigned advisor user or null if none available.
 */
const assignNextAdvisor = async ({ locationId, tx }) => {
  const client = tx || prisma;
  const numLocationId = Number(locationId);
  const startOfToday = getStartOfToday();

  // Find all active advisors for this location who have logged in today
  const eligibleAdvisors = await client.user.findMany({
    where: {
      locationId: numLocationId,
      isActive: true,
      role: {
        slug: {
          in: ADVISOR_ROLE_SLUGS
        }
      },
      lastLoginAt: {
        gte: startOfToday
      }
    },
    orderBy: {
      id: 'asc'
    },
    select: {
      id: true,
      fullName: true,
      emailId: true,
      mobileNo: true,
      lastLoginAt: true
    }
  });

  if (!eligibleAdvisors || eligibleAdvisors.length === 0) {
    return null;
  }

  if (eligibleAdvisors.length === 1) {
    const singleAdvisor = eligibleAdvisors[0];
    await client.advisorAssignmentSequence.upsert({
      where: { locationId: numLocationId },
      create: { locationId: numLocationId, lastAdvisorId: singleAdvisor.id },
      update: { lastAdvisorId: singleAdvisor.id }
    });
    return singleAdvisor;
  }

  // Look up last assigned advisor from sequence table
  const sequence = await client.advisorAssignmentSequence.findUnique({
    where: { locationId: numLocationId }
  });

  let nextAdvisor;
  if (!sequence) {
    nextAdvisor = eligibleAdvisors[0];
  } else {
    const lastIndex = eligibleAdvisors.findIndex((a) => a.id === sequence.lastAdvisorId);
    if (lastIndex === -1) {
      // Last advisor is not logged in today or not found, start with first
      nextAdvisor = eligibleAdvisors[0];
    } else {
      const nextIndex = (lastIndex + 1) % eligibleAdvisors.length;
      nextAdvisor = eligibleAdvisors[nextIndex];
    }
  }

  await client.advisorAssignmentSequence.upsert({
    where: { locationId: numLocationId },
    create: { locationId: numLocationId, lastAdvisorId: nextAdvisor.id },
    update: { lastAdvisorId: nextAdvisor.id }
  });

  return nextAdvisor;
};

/**
 * Send real-time notifications for gate entry assignment.
 *
 * @param {Object} params
 * @param {Object|null} params.advisor
 * @param {Object} params.gateEntry
 * @param {string} params.registrationNumber
 * @param {number} params.locationId
 */
const notifyAssignment = async ({ advisor, gateEntry, registrationNumber, locationId }) => {
  const numLocationId = Number(locationId);

  try {
    const io = getSocket();

    if (advisor) {
      const notification = await prisma.notification.create({
        data: {
          userId: advisor.id,
          locationId: numLocationId,
          gateEntryId: gateEntry.id,
          title: 'Vehicle Assigned to You',
          message: `Vehicle ${registrationNumber} (Entry #${gateEntry.gateEntryNo}) has been assigned to you.`,
          type: 'ADVISOR_ASSIGNED',
          sentAt: new Date()
        }
      });

      if (io) {
        io.to(`user:${advisor.id}`).emit('new-notification', {
          id: notification.id,
          title: notification.title,
          message: notification.message,
          gateEntryId: gateEntry.id,
          gateEntryNo: gateEntry.gateEntryNo,
          registrationNumber,
          createdAt: notification.createdAt
        });
        io.to(`location:${numLocationId}`).emit('gate-entry-assigned', {
          gateEntryId: gateEntry.id,
          gateEntryNo: gateEntry.gateEntryNo,
          assignedAdvisor: {
            id: advisor.id,
            fullName: advisor.fullName
          }
        });
      }
    } else {
      // Alert managers that no advisor is logged in
      const managers = await prisma.user.findMany({
        where: {
          locationId: numLocationId,
          isActive: true,
          role: {
            slug: {
              in: ['manager', 'managing-director', 'managing_director', 'admin']
            }
          }
        },
        select: { id: true }
      });

      for (const manager of managers) {
        const notification = await prisma.notification.create({
          data: {
            userId: manager.id,
            locationId: numLocationId,
            gateEntryId: gateEntry.id,
            title: 'Unassigned Gate Entry - No Advisor Logged In',
            message: `Vehicle ${registrationNumber} entered the gate, but no Advisor has logged in today at this location.`,
            type: 'ADVISOR_UNASSIGNED_ALERT',
            sentAt: new Date()
          }
        });

        if (io) {
          io.to(`user:${manager.id}`).emit('new-notification', {
            id: notification.id,
            title: notification.title,
            message: notification.message,
            gateEntryId: gateEntry.id,
            gateEntryNo: gateEntry.gateEntryNo,
            registrationNumber,
            createdAt: notification.createdAt
          });
        }
      }
    }
  } catch (error) {
    console.warn('Failed to send assignment notification:', error?.message);
  }
};

/**
 * When a Job Card is created, update the gate entry's assigned advisor
 * to the actual creator if different (keeps reports accurate).
 */
const updateAssignedAdvisorOnJobCard = async ({ gateEntryId, createdByUserId, tx }) => {
  if (!gateEntryId || !createdByUserId) return;

  const client = tx || prisma;
  try {
    const entry = await client.gateEntry.findUnique({
      where: { id: Number(gateEntryId) },
      select: { id: true, assignedAdvisorId: true }
    });

    if (entry && entry.assignedAdvisorId !== Number(createdByUserId)) {
      await client.gateEntry.update({
        where: { id: Number(gateEntryId) },
        data: { assignedAdvisorId: Number(createdByUserId) }
      });
    }
  } catch (error) {
    console.warn('Failed to sync assigned advisor on job card creation:', error?.message);
  }
};

module.exports = {
  assignNextAdvisor,
  notifyAssignment,
  updateAssignedAdvisorOnJobCard
};
