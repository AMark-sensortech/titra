import dayjs from 'dayjs'
import customParseFormat from 'dayjs/plugin/customParseFormat'
import Projects from '../api/projects/projects.js'
import Transactions from '../api/transactions/transactions.js'
import { periodToDates } from './periodHelpers.js'
import { Globalsettings } from '../api/globalsettings/globalsettings.js'
import { getGlobalSetting } from './frontend_helpers.js'

async function getGlobalSettingAsync(name) {
  const globalSetting = await Globalsettings.findOneAsync({ name })
  return globalSetting ? globalSetting.value : false
}
async function getUserSettingAsync(field) {
  const meteorUser = await Meteor.userAsync()
  if (meteorUser?.profile) {
    return typeof meteorUser.profile[field] !== 'undefined' ? meteorUser.profile[field] : getGlobalSettingAsync(field)
  }
  return false
}
/**
 * Gets the list of projects for the current user.
 * @param {string[]} projectId - The list of project IDs to get.
 * @returns {string[]} The list of project IDs.
 * @throws {Meteor.Error} If user is not authenticated.
 */
function getProjectListById(projectId) {
  let projectList = []
  const userId = Meteor.userId()
  if (projectId.includes('all')) {
    projectList = Projects.find(
      {
        $and: [
          { $or: [{ userId }, { public: true }, { team: userId }] },
          { $or: [{ archived: false }, { archived: { $exists: false } }] },
        ],
      },
      { fields: { _id: 1 } },
    ).fetch().map((value) => value._id)
  } else {
    const projectSelector = {
      _id: projectId,
      $and: [
        { $or: [{ userId }, { public: true }, { team: userId }] },
        { $or: [{ archived: false }, { archived: { $exists: false } }] },
      ],
    }
    if (projectId instanceof Array) {
      projectSelector._id = { $in: projectId }
    }
    projectList = Projects.find(
      projectSelector,
      { fields: { _id: 1 } },
    ).fetch().map((value) => value._id)
  }
  return projectList
}
/**
 * Checks if the current user is authenticated.
 * @param {Object} context - The Meteor.js context object.
 * @throws {Meteor.Error} If user is not authenticated.
 */
async function checkAuthentication(context) {
  const meteorUser = await Meteor.users.findOneAsync({ _id: context.userId })
  if (!context.userId || meteorUser?.inactive) {
    throw new Meteor.Error('notifications.auth_error_method')
  }
}
/**
 * Checks if the current user is authenticated and an admin.
 * @param {Object} context - The Meteor.js context object.
 * @throws {Meteor.Error} If user is not authenticated or not an admin.
 */
async function checkAdminAuthentication(context) {
  const meteorUser = await Meteor.users.findOneAsync({ _id: context.userId })
  if (!context.userId || meteorUser?.inactive) {
    throw new Meteor.Error('notifications.auth_error_method')
  } else if (!meteorUser.isAdmin) {
    throw new Meteor.Error('notifications.auth_error_method')
  }
}
/**
 * Get the project list based on the provided customer(s)
 * @param {string[]} customer - The list of customer IDs to get.
 * @returns {string[]} The list of project IDs.
 * @throws {Meteor.Error} If user is not authenticated.
 */
function getProjectListByCustomer(customer) {
  let projects = []
  const userId = Meteor.userId()

  if (customer.includes('all')) {
    projects = Projects.find(
      {
        $and: [
          { $or: [{ userId }, { public: true }, { team: userId }] },
          { $or: [{ archived: false }, { archived: { $exists: false } }] },
        ],
      },
      { _id: 1, name: 1 },
    )
  } else {
    const selector = {
      customer,
      $and: [
        { $or: [{ userId }, { public: true }, { team: userId }] },
        { $or: [{ archived: false }, { archived: { $exists: false } }] },
      ],
    }
    if (customer instanceof Array) {
      selector.customer = { $in: customer }
    }
    projects = Projects.find(
      selector,
      { _id: 1, name: 1 },
    )
  }
  return projects
}

/**
 * Builds the selector for the totalHoursForPeriod publication.
 * @param {string[]} projectId - The list of project IDs to get.
 * @param {string} period - The period to get.
 * @param {string[]} dates - The list of dates to get.
 * @param {string[]} userId - The list of user IDs to get.
 * @param {string[]} customer - The list of customer IDs to get.
 * @param {number} limit - The limit of entries to get.
 * @param {number} page - The page of entries to get.
 * @returns {Object} The selector.
 */
function buildTotalHoursForPeriodSelector(projectId, period, dates, userId, customer, limit, page) {
  let projectList = []
  const periodArray = []
  let matchSelector = {}
  const addFields = {
    $addFields: {
      convertedHours: { $toDecimal: '$hours' },
    },
  }
  const groupSelector = {
    $group: {
      _id: { userId: '$userId', projectId: '$projectId' },
      totalHours: { $sum: '$convertedHours' },
    },
  }
  const sortSelector = {
    $sort: {
      date: -1,
    },
  }
  const skipSelector = {
    $skip: 0,
  }
  if (page) {
    skipSelector.$skip = (page - 1) * limit
  }
  const limitSelector = {
    $limit: limit,
  }
  if (!customer.includes('all')) {
    projectList = getProjectListByCustomer(customer).fetch().map((value) => value._id)
  } else {
    projectList = getProjectListById(projectId)
  }
  if (period && period.includes('custom')) {
    matchSelector = {
      $match: {
        projectId: { $in: projectList },
        date: { $gte: dates.startDate, $lte: dates.endDate },
      },
    }
    if (!userId.includes('all')) {
      matchSelector = {
        $match: {
          projectId: { $in: projectList },
          date: { $gte: dates.startDate, $lte: dates.endDate },
          userId,
        },
      }
    }
  } else if (period && period !== 'all') {
    const { startDate, endDate } = periodToDates(period)
    matchSelector = {
      $match: {
        projectId: { $in: projectList },
        date: { $gte: startDate, $lte: endDate },
      },
    }
    if (!userId.includes('all')) {
      matchSelector = {
        $match: {
          projectId: { $in: projectList },
          date: { $gte: startDate, $lte: endDate },
          userId,
        },
      }
    }
  } else if (userId.includes('all')) {
    matchSelector = {
      $match: {
        projectId: { $in: projectList },
      },
    }
  }
  periodArray.push(addFields)
  periodArray.push(matchSelector)
  periodArray.push(groupSelector)
  periodArray.push(sortSelector)
  periodArray.push(skipSelector)
  if (limit > 0) {
    periodArray.push(limitSelector)
  }
  return periodArray
}
/**
 * Builds the selector for the dailyHours publication.
 * @param {string[]} projectId - The list of project IDs to get.
 * @param {string} period - The period to get.
 * @param {string[]} dates - The list of dates to get.
 * @param {string[]} userId - The list of user IDs to get.
 * @param {string[]} customer - The list of customer IDs to get.
 * @param {number} limit - The limit of entries to get.
 * @param {number} page - The page of entries to get.
 * @returns {Object} The selector.
 */
function buildDailyHoursSelector(projectId, period, dates, userId, customer, limit, page) {
  let projectList = []
  if (!customer.includes('all')) {
    projectList = getProjectListByCustomer(customer).fetch().map((value) => value._id)
  } else {
    projectList = getProjectListById(projectId)
  }
  const dailyArray = []
  let matchSelector = {}
  const skipSelector = {
    $skip: 0,
  }
  if (page) {
    skipSelector.$skip = (page - 1) * limit
  }
  const sortSelector = {
    $sort: {
      date: -1,
    },
  }
  const groupSelector = {
    $group: {
      _id: { userId: '$userId', projectId: '$projectId', date: '$date' },
      totalHours: { $sum: '$hours' },
    },
  }
  const limitSelector = {
    $limit: limit,
  }
  if (period && period === 'custom') {
    if (userId.includes('all')) {
      matchSelector = {
        $match: {
          projectId: { $in: projectList },
          date: { $gte: dates.startDate, $lte: dates.endDate },
        },
      }
    } else {
      matchSelector = {
        $match: {
          projectId: { $in: projectList },
          date: { $gte: dates.startDate, $lte: dates.endDate },
          userId,
        },
      }
    }
  } else if (period && period !== 'all') {
    const { startDate, endDate } = periodToDates(period)
    if (userId.includes('all')) {
      matchSelector = {
        $match: {
          projectId: { $in: projectList },
          date: { $gte: startDate, $lte: endDate },
        },
      }
    } else {
      matchSelector = {
        $match: {
          projectId: { $in: projectList },
          date: { $gte: startDate, $lte: endDate },
          userId,
        },
      }
    }
  } else if (userId.includes('all')) {
    matchSelector = {
      $match: {
        projectId: { $in: projectList },
      },
    }
  } else {
    matchSelector = {
      $match: {
        projectId: { $in: projectList },
        userId,
      },
    }
  }
  dailyArray.push(matchSelector)
  dailyArray.push(groupSelector)
  dailyArray.push(sortSelector)
  dailyArray.push(skipSelector)
  if (limit > 0) {
    dailyArray.push(limitSelector)
  }
  return dailyArray
}
/**
 * Builds the selector for the workingTime publication.
 * @param {string[]} projectId - The list of project IDs to get.
 * @param {string} period - The period to get.
 * @param {string[]} dates - The list of dates to get.
 * @param {string[]} userId - The list of user IDs to get.
 * @param {number} limit - The limit of entries to get.
 * @param {number} page - The page of entries to get.
 * @returns {Object} The selector.
 */
function buildworkingTimeSelector(projectId, period, dates, userId, limit, page) {
  let projectList = []
  projectList = getProjectListById(projectId)
  const workingTimeArray = []
  const skipSelector = {
    $skip: 0,
  }
  if (page) {
    skipSelector.$skip = (page - 1) * limit
  }
  let matchSelector = {}
  const sortSelector = {
    $sort: {
      date: -1,
    },
  }
  const groupSelector = {
    $group: {
      _id: { userId: '$userId', date: '$date' },
      totalTime: { $sum: '$hours' },
    },
  }
  const limitSelector = {
    $limit: limit,
  }
  if (period && period === 'custom') {
    if (userId.includes('all')) {
      matchSelector = {
        $match: {
          projectId: { $in: projectList },
          date: { $gte: dates.startDate, $lte: dates.endDate },
        },
      }
    } else {
      matchSelector = {
        $match: {
          projectId: { $in: projectList },
          date: { $gte: dates.startDate, $lte: dates.endDate },
          userId,
        },
      }
    }
  } else if (period && period !== 'all') {
    const { startDate, endDate } = periodToDates(period)
    if (userId.includes('all')) {
      matchSelector = {
        $match: {
          projectId: { $in: projectList },
          date: { $gte: startDate, $lte: endDate },
        },
      }
    } else {
      matchSelector = {
        $match: {
          projectId: { $in: projectList },
          date: { $gte: startDate, $lte: endDate },
          userId,
        },
      }
    }
  } else if (userId.includes('all')) {
    matchSelector = {
      $match: {
        projectId: { $in: projectList },
      },
    }
  } else {
    matchSelector = {
      $match: {
        projectId: { $in: projectList },
        userId,
      },
    }
  }
  workingTimeArray.push(matchSelector)
  workingTimeArray.push(groupSelector)
  workingTimeArray.push(skipSelector)
  workingTimeArray.push(sortSelector)
  if (limit > 0) {
    workingTimeArray.push(limitSelector)
  }
  return workingTimeArray
}
/**
 * Mapper function for the working time entries publication
 * @param {Object} entry - The entry to map.
 * @returns {Object} The mapped entry.
 */
async function workingTimeEntriesMapper(entry) {
  dayjs.extend(customParseFormat)
  const meteorUser = await Meteor.users.findOneAsync({ _id: entry._id.userId })
  const userBreakStartTime = dayjs(meteorUser?.profile?.breakStartTime ? meteorUser.profile.breakStartTime : getGlobalSettingAsync('breakStartTime'), 'HH:mm')
  const userBreakDuration = meteorUser?.profile?.breakDuration ? meteorUser.profile.breakDuration : getGlobalSettingAsync('breakDuration')
  const userBreakEndTime = dayjs(userBreakStartTime, 'HH:mm').add(userBreakDuration, 'hour')
  const userRegularWorkingTime = meteorUser?.profile?.regularWorkingTime ? meteorUser.profile.regularWorkingTime : getGlobalSettingAsync('regularWorkingTime')
  const userStartTime = meteorUser?.profile?.dailyStartTime ? meteorUser.profile.dailyStartTime : getGlobalSettingAsync('dailyStartTime')
  let userEndTime = dayjs(userStartTime, 'HH:mm').add(entry.totalTime, 'hour')
  if (await getGlobalSettingAsync('addBreakToWorkingTime')) {
    userEndTime = userEndTime.add(userBreakDuration, 'hour')
  }
  return {
    date: entry._id.date,
    resource: meteorUser?.profile?.name,
    startTime: userStartTime,
    breakStartTime: userEndTime.isAfter(userBreakStartTime) ? userBreakStartTime.format('HH:mm') : '',
    breakEndTime: userEndTime.isAfter(userBreakStartTime) ? userBreakEndTime.format('HH:mm') : '',
    endTime: userEndTime.format('HH:mm'),
    totalTime: entry.totalTime,
    regularWorkingTime: Number(userRegularWorkingTime),
    regularWorkingTimeDifference: entry.totalTime - userRegularWorkingTime,
  }
}
/**
 * Builds the selector for the detailedTimeEntries publication.
 * @param {string[]} projectId - The list of project IDs to get.
 * @param {string} search - The search string to get.
 * @param {string[]} customer - The list of customer IDs to get.
 * @param {string} period - The period to get.
 * @param {Object} dates - The dates to get.
 * @param {string[]} userId - The list of user IDs to get.
 * @param {number} limit - The limit to get.
 * @param {number} page - The page to get.
 * @param {Object} sort - The sort to get.
 * @returns {Object} The selector for the detailedTimeEntries method.
 */
function buildDetailedTimeEntriesForPeriodSelector({
  projectId, search, customer, period, dates, userId, limit, page, sort, filters,
}) {
  const detailedTimeArray = []
  let projectList = getProjectListById(projectId)
  if (!customer.includes('all') && projectId.includes('all')) {
    projectList = getProjectListByCustomer(customer).fetch().map((value) => value._id)
  }
  const query = { projectId: { $in: projectList } }
  if (search) {
    query.task = { $regex: `.*${search.replace(/[-[\]{}()*+?.,\\/^$|#\s]/g, '\\$&')}.*`, $options: 'i' }
  }
  const options = { sort: {} }
  if (limit && limit > 0) {
    options.limit = limit
  }
  if (sort) {
    let field
    let order
    switch (sort.column) {
      case 0:
        field = 'projectId'
        break
      case 1:
        field = 'date'
        break
      case 2:
        field = 'task'
        break
      case 3:
        field = 'userId'
        break
      case 4:
        field = 'hours'
        break
      default:
        field = 'date'
    }
    switch (sort.order) {
      case 'asc':
        order = 1
        break
      case 'desc':
        order = -1
        break
      default:
        order = -1
        break
    }
    options.sort[field] = order
  } else {
    options.sort = { date: -1 }
  }

  if (page) {
    options.skip = (page - 1) * limit
  }
  if (period === 'custom') {
    query.date = { $gte: dates.startDate, $lte: dates.endDate }
  } else if (period !== 'all') {
    const { startDate, endDate } = periodToDates(period)
    query.date = { $gte: startDate, $lte: endDate }
  }
  if (!userId.includes('all')) {
    if (userId instanceof Array) {
      query.userId = { $in: userId }
    } else {
      query.userId = userId
    }
  }
  let finalQuery = query
  if (filters) {
    finalQuery = {}
    for (const filterKey in filters) {
      if (filters.hasOwnProperty(filterKey)) {
        const filterValue = filters[filterKey]
        if (filterKey === 'customer') {
          const projectIds = getProjectListByCustomer(filterValue).fetch().map((value) => value._id)
          filters.projectId = { $in: projectIds }
          delete filters[filterKey]
        } else if (filterKey === 'state' && filterValue === 'new') {
          filters.$or = [{ state: { $exists: false } }, { state: 'new' }]
          delete filters[filterKey]
        } else if (filterKey === 'date' && typeof filters[filterKey] === 'string') {
          dayjs.extend(customParseFormat)
          const startDate = dayjs(filterValue, getGlobalSetting('dateformat')).startOf('day').toDate()
          const endDate = dayjs(filterValue, getGlobalSetting('dateformat')).endOf('day').toDate()
          filters.date = { $gte: startDate, $lte: endDate }
        } else if (filterKey === 'hours' && typeof filterValue === 'string') {
          filters.hours = Number(filterValue)
        }
      }
    }
    finalQuery.$and = []
    finalQuery.$and.push(query)
    finalQuery.$and.push(filters)
  }
  detailedTimeArray.push(finalQuery)
  detailedTimeArray.push(options)
  return detailedTimeArray
}
function authenticationMixin(methodOptions) {
  const runFunc = methodOptions.run
  methodOptions.run = async function (args) {
    await checkAuthentication(this)
    return runFunc.call(this, args)
  }
  return methodOptions
}
function adminAuthenticationMixin(methodOptions) {
  const runFunc = methodOptions.run
  methodOptions.run = async function (args) {
    await checkAdminAuthentication(this)
    return runFunc.call(this, args)
  }
  return methodOptions
}
function transactionLogMixin(methodOptions) {
  const runFunc = methodOptions.run
  methodOptions.run = async function (args) {
    if (await getGlobalSettingAsync('enableTransactions')) {
      const user = await Meteor.users.findOneAsync({ _id: this.userId }, {
        _id: 1, 'profile.name': 1, emails: 1, isAdmin: 1,
      })
      const transaction = {
        user: JSON.stringify({
          _id: user._id, name: user.profile.name, emails: user.emails, isAdmin: user.isAdmin,
        }),
        method: this.name,
        args: JSON.stringify(args),
        timestamp: new Date(),
      }
      Transactions.insert(transaction)
    }
    return runFunc.call(this, args)
  }
  return methodOptions
}
/**
 * Calculates the edit distance between two strings using the Levenshtein distance algorithm.
 * @param {string} string1 - The first string to compare.
 * @param {string} string2 - The second string to compare.
 * @returns {number} The edit distance between the two strings.
 */
function editDistance(string1, string2) {
  const s1 = string1.toLowerCase()
  const s2 = string2.toLowerCase()

  const costs = []
  for (let i = 0; i <= s1.length; i += 1) {
    let lastValue = i
    for (let j = 0; j <= s2.length; j += 1) {
      if (i === 0) { costs[j] = j } else if (j > 0) {
        let newValue = costs[j - 1]
        if (s1.charAt(i - 1) !== s2.charAt(j - 1)) {
          newValue = Math.min(
            Math.min(newValue, lastValue),
            costs[j],
          ) + 1
        }
        costs[j - 1] = lastValue
        lastValue = newValue
      }
    }
    if (i > 0) { costs[s2.length] = lastValue }
  }
  return costs[s2.length]
}

/**
 * Calculates the similarity between two strings using the Levenshtein distance algorithm.
 * @param {string} s1 - The first string to compare.
 * @param {string} s2 - The second string to compare.
 * @returns {number} - A value between 0 and 1 representing the similarity between the two strings.
 */
function calculateSimilarity(s1, s2) {
  if (s1 && s2) {
    let longer = s1
    let shorter = s2
    if (s1.length < s2.length) {
      longer = s2
      shorter = s1
    }
    const longerLength = longer.length
    if (longerLength === 0) {
      return 1.0
    }
    return (longerLength - editDistance(longer, shorter)) / parseFloat(longerLength)
  }
  return 0
}
export {
  authenticationMixin,
  adminAuthenticationMixin,
  transactionLogMixin,
  checkAuthentication,
  checkAdminAuthentication,
  getProjectListById,
  getProjectListByCustomer,
  buildTotalHoursForPeriodSelector,
  buildDailyHoursSelector,
  workingTimeEntriesMapper,
  buildworkingTimeSelector,
  buildDetailedTimeEntriesForPeriodSelector,
  getGlobalSettingAsync,
  getUserSettingAsync,
  calculateSimilarity,
}
