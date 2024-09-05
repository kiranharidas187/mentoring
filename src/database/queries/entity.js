const { Op } = require('sequelize')

const Entity = require('../models/index').Entity
module.exports = class UserEntityData {
	static async createEntity(data) {
		try {
			return await Entity.create(data, { returning: true })
		} catch (error) {
			throw error
		}
	}

	static async findAllEntities(filter, options = {}) {
		try {
			return await Entity.findAll({
				where: filter,
				...options,
				raw: true,
			})
		} catch (error) {
			throw error
		}
	}

	static async updateOneEntity(id, update, userId, options = {}) {
		try {
			return await Entity.update(update, {
				where: {
					id: id,
					created_by: userId,
				},
				...options,
			})
		} catch (error) {
			throw error
		}
	}

	static async deleteOneEntityType(id, userId) {
		try {
			return await Entity.destroy({
				where: {
					id: id,
					created_by: userId,
				},
			})
		} catch (error) {
			throw error
		}
	}

	static async findEntityTypeById(filter) {
		try {
			const entityData = await Entity.findByPk(filter)
			return entityData
		} catch (error) {
			return error
		}
	}

	static async getAllEntities(filters, attributes, page, limit, search) {
		try {
			return await Entity.findAndCountAll({
				where: {
					[Op.or]: [{ label: { [Op.iLike]: `%${search}%` } }],
					...filters,
				},
				attributes: attributes,
				offset: limit * (page - 1),
				limit: limit,
				order: [['created_at', 'DESC']],
			})
		} catch (error) {
			throw error
		}
	}
}
