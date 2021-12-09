const moment = require("moment-timezone");
const common = require('../../constants/common');

const sessionData = require("../../db/sessions/queries");
const notificationData = require("../../db/notification-template/query");
const userProfile = require("./userProfile");

const kafkaCommunication = require('../../generics/kafka-communication');

module.exports = class SessionsHelper {

   
    static async sendNotificationBefore1Hour() {

       
        
        // let minutesFor24Hour = 1440;

        // let data = await sessionData.findSessions({
        //     status: "published",
        //     deleted: false
        // });

        // let emailTemplate = await notificationData.findOneEmailTemplate(common.MENTOR_24HOUR_REMAINDER_EMAIL_CODE);

        // if (data && data.length > 0) {
        //     data.forEach(async function (session) {

        //         if (session && session.startDateUtc) {

        //             let currentDate = moment();
        //             if (session.timeZone) {
        //                 currentDate = currentDate.tz(session.timeZone).format("YYYY-MM-DDTHH:mm:ssZ");
        //             } else {
        //                 currentDate = currentDate.format("YYYY-MM-DDTHH:mm:ssZ");
        //             }

                  
        //             let differanceMinutes = moment(session.startDateUtc).diff(currentDate, 'minutes');
        //             console.log("currentDate",currentDate,"-------",session.startDateUtc,"differanceMinutes",differanceMinutes);
        //             if (differanceMinutes == minutesFor24Hour) {

        //                 let userData = await userProfile.details("", session.userId);
        //                 if (userData && userData.data && userData.data.result) {

        //                     emailTemplate.body = emailTemplate.body.replace("{sessionTitle}", session.title);
        //                     emailTemplate.body = emailTemplate.body.replace("{name}", userData.data.result.name);

        //                     const payload = {
        //                         type: 'email',
        //                         email: {
        //                             to: userData.data.result.email,
        //                             subject: emailTemplate.subject,
        //                             body: emailTemplate.body
        //                         }
        //                     };
        //                     await kafkaCommunication.pushEmailToKafka(payload);
        //                 }
        //             }

        //         }
        //     });

        // }



    }
    static async sendNotificationBefore15mins() {

        let currentDateutc = moment().utc().format(common.UTC_DATE_TIME_FORMAT);

        var dateEndTime = moment(currentDateutc).add(16, 'minutes').format(common.UTC_DATE_TIME_FORMAT);
        var dateStartTime = moment(currentDateutc).add(15, 'minutes').format(common.UTC_DATE_TIME_FORMAT);



        let data = await sessionData.findSessions({
            status: "published",
            deleted: false,
            startDateUtc: {
                $gte: dateStartTime , $lte:dateEndTime
            }
        });

        let emailTemplate = await notificationData.findOneEmailTemplate(common.MENTOR_15MINS_REMAINDER_EMAIL_CODE);

        if (data && data.length > 0) {
            data.forEach(async function (session) {

                if (session && session.startDateUtc) {
                   
                        let userData = await userProfile.details("", session.userId);
                        if (userData && userData.data && userData.data.result) {

                            emailTemplate.body = emailTemplate.body.replace("{sessionTitle}", session.title);
                            emailTemplate.body = emailTemplate.body.replace("{name}", userData.data.result.name);

                            const payload = {
                                type: 'email',
                                email: {
                                    to: userData.data.result.email,
                                    subject: emailTemplate.subject,
                                    body: emailTemplate.body
                                }
                            };
                            await kafkaCommunication.pushEmailToKafka(payload);
                        }
                }
            });

        }



    }
}