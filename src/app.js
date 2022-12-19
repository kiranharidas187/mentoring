/**
 * name : app.js
 * author : Aman Kumar Gupta
 * Date : 29-Sep-2021
 * Description : Start file of a mentoring service
 */
require('module-alias/register')
const express = require('express')
const bodyParser = require('body-parser')
const cors = require('cors')
const { logger, correlationIdMiddleware } = require('elevate-logger')
require('dotenv').config({ path: './.env' })
const path = require('path')
const i18next = require('i18next')
const Backend = require('i18next-fs-backend')
const middleware = require('i18next-http-middleware')
let environmentData = require('./envVariables')()

if (!environmentData.success) {
	console.log('Server could not start . Not all environment variable is provided')
	process.exit()
}

require('@configs')

i18next
	.use(Backend)
	.use(middleware.LanguageDetector)
	.init({
		fallbackLng: 'en',
		lng: 'en',
		ns: ['translation'],
		defaultNS: 'translation',
		backend: {
			loadPath: './locales/{{lng}}.json',
		},
		detection: {
			lookupHeader: 'accept-language',
		},
	})

const app = express()

// Health check
require('@health-checks')(app)

app.use(cors())
app.use(middleware.handle(i18next))
app.use(correlationIdMiddleware)

app.use(bodyParser.urlencoded({ extended: true, limit: '50MB' }))
app.use(bodyParser.json({ limit: '50MB' }))

app.use(express.static('public'))

app.get(process.env.API_DOC_URL, function (req, res) {
	res.sendFile(path.join(__dirname, './api-doc/index.html'))
})

/* Logs request info if environment is not development*/
if (process.env.ENABLE_LOG === 'true') {
	app.all('*', async (req, res, next) => {
		// if (req.headers['x-request-ids'] == 'ankit') {
		// 	await new Promise((r) => setTimeout(r, 10000))
		// }
		// logger.info(`Request Type ${req.method} for ${req.url} on ${new Date()} from `)
		// logger.info(req.headers)
		// logger.info('Request Body: ', req.body)
		// logger.info('Mentoring Service Logs Starts Here')
		// console.log('%s %s on %s from ', req.method, req.url, new Date(), req.headers['user-agent'])
		// console.log('Request Headers: ', req.headers)
		// console.log('Request Body: ', req.body)
		// console.log('Request Files: ', req.files)
		// console.log('***Mentoring Service Logs Ends Here***')
		logger.info('<===mentoring Service Logs Starts Here===>')
		logger.info(`Request Type ${req.method} for ${req.url} on ${new Date()} from `)
		logger.info('Request Headers: ')
		logger.info(req.headers)
		logger.info('Request Body: ')
		logger.info(req.body)
		logger.info('Request Files: ')
		logger.info(req.files)
		logger.info('<===mentoring Service Logs Ends Here===>')
		next()
	})
}

/* Registered routes here */
require('./routes')(app)

// Server listens to given port
app.listen(process.env.APPLICATION_PORT, (res, err) => {
	if (err) {
		onError(err)
	}
	logger.info('Environment: ' + process.env.APPLICATION_ENV)
	logger.info('Application is running on the port:' + process.env.APPLICATION_PORT)
})

// Handles specific listen errors with friendly messages
function onError(error) {
	switch (error.code) {
		case 'EACCES':
			logger.info(process.env.APPLICATION_PORT + ' requires elevated privileges')
			process.exit(1)
		case 'EADDRINUSE':
			logger.info(process.env.APPLICATION_PORT + ' is already in use')
			process.exit(1)
		default:
			throw error
	}
}
