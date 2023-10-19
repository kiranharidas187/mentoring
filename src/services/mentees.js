// Dependencies
const userRequests = require('@requests/user')
const common = require('@constants/common')
const httpStatusCode = require('@generics/http-status')
const feedbackHelper = require('./feedback')
const utils = require('@generics/utils')

const { successResponse } = require('@constants/common')

const { UniqueConstraintError } = require('sequelize')
const menteeQueries = require('@database/queries/userExtension')
const sessionAttendeesQueries = require('@database/queries/sessionAttendees')
const sessionQueries = require('@database/queries/sessions')
const _ = require('lodash')
const entityTypeQueries = require('@database/queries/entityType')
const bigBlueButtonService = require('./bigBlueButton')

module.exports = class MenteesHelper {
	/**
	 * Profile.
	 * @method
	 * @name profile
	 * @param {String} userId - user id.
	 * @returns {JSON} - profile details
	 */
	static async read(id, orgId) {
		const menteeDetails = await userRequests.details('', id)
		const mentee = await menteeQueries.getMenteeExtension(id)
		delete mentee.user_id
		delete mentee.organisation_ids

		let validationData = await entityTypeQueries.findUserEntityTypesAndEntities(
			{
				status: 'ACTIVE',
			},
			orgId
		)

		validationData = utils.removeParentEntityTypes(JSON.parse(JSON.stringify(validationData)))

		const processDbResponse = utils.processDbResponse(mentee, validationData)

		const totalSession = await sessionAttendeesQueries.countEnrolledSessions(id)

		return successResponse({
			statusCode: httpStatusCode.ok,
			message: 'PROFILE_FTECHED_SUCCESSFULLY',
			result: { sessions_attended: totalSession, ...menteeDetails.data.result, ...processDbResponse },
		})
	}

	/**
	 * Sessions list. Includes upcoming and enrolled sessions.
	 * @method
	 * @name sessions
	 * @param {String} userId - user id.
	 * @param {Boolean} enrolledSessions - true/false.
	 * @param {Number} page - page No.
	 * @param {Number} limit - page limit.
	 * @param {String} search - search field.
	 * @returns {JSON} - List of sessions
	 */

	static async sessions(userId, enrolledSessions, page, limit, search = '') {
		try {
			let sessions = []

			if (!enrolledSessions) {
				/** Upcoming unenrolled sessions {All sessions}*/
				sessions = await this.getAllSessions(page, limit, search, userId)
			} else {
				/** Upcoming user's enrolled sessions {My sessions}*/
				/* Fetch sessions if it is not expired or if expired then either status is live or if mentor 
                delays in starting session then status will remain published for that particular interval so fetch that also */

				/* TODO: Need to write cron job that will change the status of expired sessions from published to cancelled if not hosted by mentor */
				sessions = await this.getMySessions(page, limit, search, userId)
			}
			return common.successResponse({
				statusCode: httpStatusCode.ok,
				message: 'SESSION_FETCHED_SUCCESSFULLY',
				result: { data: sessions.rows, count: sessions.count },
			})
		} catch (error) {
			throw error
		}
	}

	/**
	 * Mentees reports.
	 * @method
	 * @name reports
	 * @param {String} userId - user id.
	 * @param {String} filterType - MONTHLY/WEEKLY/QUARTERLY.
	 * @returns {JSON} - Mentees reports
	 */

	static async reports(userId, filterType) {
		try {
			let filterStartDate, filterEndDate

			switch (filterType) {
				case 'MONTHLY':
					;[filterStartDate, filterEndDate] = utils.getCurrentMonthRange()
					break
				case 'WEEKLY':
					;[filterStartDate, filterEndDate] = utils.getCurrentWeekRange()
					break
				case 'QUARTERLY':
					;[filterStartDate, filterEndDate] = utils.getCurrentQuarterRange()
					break
				default:
					throw new Error('Invalid filterType')
			}

			const totalSessionsEnrolled = await sessionAttendeesQueries.getEnrolledSessionsCountInDateRange(
				filterStartDate.toISOString(),
				filterEndDate.toISOString(),
				userId
			)

			const totalSessionsAttended = await sessionAttendeesQueries.getAttendedSessionsCountInDateRange(
				filterStartDate.toISOString(),
				filterEndDate.toISOString(),
				userId
			)

			const result = {
				total_session_enrolled: totalSessionsEnrolled,
				total_session_attended: totalSessionsAttended,
			}

			return common.successResponse({
				statusCode: httpStatusCode.ok,
				message: 'MENTEES_REPORT_FETCHED_SUCCESSFULLY',
				result,
			})
		} catch (error) {
			throw error
		}
	}

	/**
	 * Mentees homeFeed.
	 * @method
	 * @name homeFeed
	 * @param {String} userId - user id.
	 * @param {Boolean} isAMentor - true/false.
	 * @returns {JSON} - Mentees homeFeed.
	 */

	static async homeFeed(userId, isAMentor, page, limit, search) {
		try {
			/* All Sessions */

			let allSessions = await this.getAllSessions(page, limit, search, userId)

			/* My Sessions */

			let mySessions = await this.getMySessions(page, limit, search, userId)

			const result = {
				all_sessions: allSessions.rows,
				my_sessions: mySessions.rows,
			}
			const feedbackData = await feedbackHelper.pending(userId, isAMentor)

			return common.successResponse({
				statusCode: httpStatusCode.ok,
				message: 'SESSION_FETCHED_SUCCESSFULLY',
				result: result,
				meta: {
					type: 'feedback',
					data: feedbackData.result,
				},
			})
		} catch (error) {
			throw error
		}
	}

	/**
	 * Join session as Mentees.
	 * @method
	 * @name joinSession
	 * @param {String} sessionId - session id.
	 * @param {String} token - Mentees token.
	 * @returns {JSON} - Mentees join session link.
	 */

	static async joinSession(sessionId, token) {
		try {
			const mentee = await userRequests.details(token)

			if (mentee.data.responseCode !== 'OK') {
				return common.failureResponse({
					message: 'USER_NOT_FOUND',
					statusCode: httpStatusCode.bad_request,
					responseCode: 'CLIENT_ERROR',
				})
			}

			const session = await sessionQueries.findById(sessionId)

			if (!session) {
				return common.failureResponse({
					message: 'SESSION_NOT_FOUND',
					statusCode: httpStatusCode.bad_request,
					responseCode: 'CLIENT_ERROR',
				})
			}
			if (session.status == 'COMPLETED') {
				return common.failureResponse({
					message: 'SESSION_ENDED',
					statusCode: httpStatusCode.bad_request,
					responseCode: 'CLIENT_ERROR',
				})
			}

			if (session.status !== 'LIVE') {
				return common.failureResponse({
					message: 'JOIN_ONLY_LIVE_SESSION',
					statusCode: httpStatusCode.bad_request,
					responseCode: 'CLIENT_ERROR',
				})
			}

			let menteeDetails = mentee.data.result
			const sessionAttendee = await sessionAttendeesQueries.findAttendeeBySessionAndUserId(
				menteeDetails.id,
				sessionId
			)
			if (!sessionAttendee) {
				return common.failureResponse({
					message: 'USER_NOT_ENROLLED',
					statusCode: httpStatusCode.bad_request,
					responseCode: 'CLIENT_ERROR',
				})
			}
			let meetingInfo
			if (session?.meeting_info?.value !== common.BBB_VALUE) {
				meetingInfo = session.meeting_info

				await sessionAttendeesQueries.updateOne(
					{
						id: sessionAttendee.id,
					},
					{
						meeting_info: meetingInfo,
						joined_at: utils.utcFormat(),
					}
				)
				return common.successResponse({
					statusCode: httpStatusCode.ok,
					message: 'SESSION_START_LINK',
					result: meetingInfo,
				})
			}
			if (sessionAttendee?.meeting_info?.link) {
				meetingInfo = sessionAttendee.meeting_info
			} else {
				const attendeeLink = await bigBlueButtonService.joinMeetingAsAttendee(
					sessionId,
					menteeDetails.name,
					session.menteePassword
				)
				meetingInfo = {
					value: common.BBB_VALUE,
					platform: common.BBB_PLATFORM,
					link: attendeeLink,
				}
				await sessionAttendeesQueries.updateOne(
					{
						id: sessionAttendee.id,
					},
					{
						meeting_info: meetingInfo,
						joined_at: utils.utcFormat(),
					}
				)
			}

			return common.successResponse({
				statusCode: httpStatusCode.ok,
				message: 'SESSION_START_LINK',
				result: meetingInfo,
			})
		} catch (error) {
			return error
		}
	}

	/**
	 * Get all upcoming unenrolled session.
	 * @method
	 * @name getAllSessions
	 * @param {Number} page - page No.
	 * @param {Number} limit - page limit.
	 * @param {String} search - search session.
	 * @param {String} userId - user id.
	 * @returns {JSON} - List of all sessions
	 */

	static async getAllSessions(page, limit, search, userId) {
		const sessions = await sessionQueries.getUpcomingSessions(page, limit, search, userId)

		sessions.rows = await this.menteeSessionDetails(sessions.rows, userId)
		sessions.rows = await this.sessionMentorDetails(sessions.rows)
		return sessions
	}

	/**
	 * Get all enrolled session.
	 * @method
	 * @name getMySessions
	 * @param {Number} page - page No.
	 * @param {Number} limit - page limit.
	 * @param {String} search - search session.
	 * @param {String} userId - user id.
	 * @returns {JSON} - List of enrolled sessions
	 */

	static async getMySessions(page, limit, search, userId) {
		try {
			const upcomingSessions = await sessionQueries.getUpcomingSessions(page, limit, search, userId)

			const upcomingSessionIds = upcomingSessions.rows.map((session) => session.id)

			const usersUpcomingSessions = await sessionAttendeesQueries.usersUpcomingSessions(
				userId,
				upcomingSessionIds
			)

			const usersUpcomingSessionIds = usersUpcomingSessions.map(
				(usersUpcomingSession) => usersUpcomingSession.session_id
			)

			let sessionDetails = await sessionQueries.findAndCountAll({ id: usersUpcomingSessionIds })

			sessionDetails.rows = await this.sessionMentorDetails(sessionDetails.rows)

			return sessionDetails
		} catch (error) {
			throw error
		}
	}

	static async menteeSessionDetails(sessions, userId) {
		try {
			if (sessions.length > 0) {
				const sessionIds = sessions.map((session) => session.id)

				const attendees = await sessionAttendeesQueries.findAll({
					session_id: sessionIds,
					mentee_id: userId,
				})

				await Promise.all(
					sessions.map(async (session) => {
						const attendee = attendees.find((attendee) => attendee.session_id === session.id)
						session.is_enrolled = !!attendee
					})
				)

				return sessions
			} else {
				return sessions
			}
		} catch (err) {
			return err
		}
	}

	static async sessionMentorDetails(sessions) {
		try {
			if (sessions.length === 0) {
				return sessions
			}

			// Extract unique mentor_ids
			const mentorIds = [...new Set(sessions.map((session) => session.mentor_id))]

			// Fetch mentor details
			const mentorDetails = (await userRequests.getListOfUserDetails(mentorIds)).result

			// Map mentor names to sessions
			sessions.forEach((session) => {
				const mentor = mentorDetails.find((mentorDetail) => mentorDetail.id === session.mentor_id)
				if (mentor) {
					session.mentor_name = mentor.name
				}
			})

			// Fetch and update image URLs in parallel
			await Promise.all(
				sessions.map(async (session) => {
					if (session.image && session.image.length > 0) {
						session.image = await Promise.all(
							session.image.map(async (imgPath) =>
								imgPath ? await utils.getDownloadableUrl(imgPath) : null
							)
						)
					}
				})
			)

			return sessions
		} catch (error) {
			throw error
		}
	}
	// Functions for new APIs
	/**
	 * Create a new mentee extension.
	 * @method
	 * @name createMenteeExtension
	 * @param {Object} data - Mentee extension data to be created.
	 * @param {String} userId - User ID of the mentee.
	 * @returns {Promise<Object>} - Created mentee extension details.
	 */
	static async createMenteeExtension(data, userId, orgId) {
		try {
			data.user_id = userId

			let validationData = await entityTypeQueries.findUserEntityTypesAndEntities(
				{
					status: 'ACTIVE',
				},
				orgId
			)

			validationData = utils.removeParentEntityTypes(JSON.parse(JSON.stringify(validationData)))

			let res = utils.validateInput(data, validationData, 'user_extensions')
			if (!res.success) {
				return common.failureResponse({
					message: 'SESSION_CREATION_FAILED',
					statusCode: httpStatusCode.bad_request,
					responseCode: 'CLIENT_ERROR',
					result: res.errors,
				})
			}
			let menteeExtensionsModel = await menteeQueries.getColumns()
			data = utils.restructureBody(data, validationData, menteeExtensionsModel)
			const response = await menteeQueries.createMenteeExtension(data)
			const processDbResponse = utils.processDbResponse(response.toJSON(), validationData)

			return common.successResponse({
				statusCode: httpStatusCode.ok,
				message: 'MENTEE_EXTENSION_CREATED',
				result: processDbResponse,
			})
		} catch (error) {
			if (error instanceof UniqueConstraintError) {
				return common.failureResponse({
					message: 'MENTEE_EXTENSION_EXITS',
					statusCode: httpStatusCode.bad_request,
					responseCode: 'CLIENT_ERROR',
				})
			}
			return error
		}
	}

	/**
	 * Update a mentee extension.
	 * @method
	 * @name updateMenteeExtension
	 * @param {String} userId - User ID of the mentee.
	 * @param {Object} data - Updated mentee extension data excluding user_id.
	 * @returns {Promise<Object>} - Updated mentee extension details.
	 */
	static async updateMenteeExtension(data, userId, orgId) {
		try {
			if (data.user_id) {
				delete data['user_id']
			}
			const filter = {
				status: 'ACTIVE',
			}
			let validationData = await entityTypeQueries.findUserEntityTypesAndEntities(filter, orgId)

			validationData = utils.removeParentEntityTypes(JSON.parse(JSON.stringify(validationData)))
			let res = utils.validateInput(data, validationData, 'user_extensions')
			if (!res.success) {
				return common.failureResponse({
					message: 'SESSION_CREATION_FAILED',
					statusCode: httpStatusCode.bad_request,
					responseCode: 'CLIENT_ERROR',
					result: res.errors,
				})
			}

			let userExtensionModel = await menteeQueries.getColumns()

			data = utils.restructureBody(data, validationData, userExtensionModel)

			const [updateCount, updatedUser] = await menteeQueries.updateMenteeExtension(userId, data, {
				returning: true,
				raw: true,
			})

			if (updateCount === '0') {
				return common.failureResponse({
					statusCode: httpStatusCode.not_found,
					message: 'MENTEE_EXTENSION_NOT_FOUND',
				})
			}
			const processDbResponse = utils.processDbResponse(updatedUser[0], validationData)

			return common.successResponse({
				statusCode: httpStatusCode.ok,
				message: 'MENTEE_EXTENSION_UPDATED',
				result: processDbResponse,
			})
		} catch (error) {
			return error
		}
	}

	/**
	 * Get mentee extension details by user ID.
	 * @method
	 * @name getMenteeExtension
	 * @param {String} userId - User ID of the mentee.
	 * @returns {Promise<Object>} - Mentee extension details.
	 */
	static async getMenteeExtension(userId) {
		try {
			const mentee = await menteeQueries.getMenteeExtension(userId, orgId)
			if (!mentee) {
				return common.failureResponse({
					statusCode: httpStatusCode.not_found,
					message: 'MENTEE_EXTENSION_NOT_FOUND',
				})
			}
			const filter = {
				status: 'ACTIVE',
			}
			console.log(mentee)
			let validationData = await entityTypeQueries.findUserEntityTypesAndEntities(filter, orgId)

			validationData = utils.removeParentEntityTypes(JSON.parse(JSON.stringify(validationData)))
			const processDbResponse = utils.processDbResponse(mentee, validationData)

			return common.successResponse({
				statusCode: httpStatusCode.ok,
				message: 'MENTEE_EXTENSION_FETCHED',
				result: processDbResponse,
			})
		} catch (error) {
			return error
		}
	}

	/**
	 * Delete a mentee extension by user ID.
	 * @method
	 * @name deleteMenteeExtension
	 * @param {String} userId - User ID of the mentee.
	 * @returns {Promise<Object>} - Indicates if the mentee extension was deleted successfully.
	 */
	static async deleteMenteeExtension(userId) {
		try {
			const deleteCount = await menteeQueries.deleteMenteeExtension(userId)
			if (deleteCount === '0') {
				return common.failureResponse({
					statusCode: httpStatusCode.not_found,
					message: 'MENTEE_EXTENSION_NOT_FOUND',
				})
			}
			return common.successResponse({
				statusCode: httpStatusCode.ok,
				message: 'MENTEE_EXTENSION_DELETED',
			})
		} catch (error) {
			return error
		}
	}
}