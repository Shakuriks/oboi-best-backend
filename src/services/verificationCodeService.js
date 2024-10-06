const axios = require('axios')
const { redisClient } = require('./redisService') // Путь к вашему сервису базы данных

function generateVerificationCode(length = 6) {
  return Math.floor(100000 + Math.random() * 900000) // Генерация 6-значного кода
}

// Функция для проверки кода
async function verifyCode(phoneNumber, inputCode) {
  const storedCode = await redisClient.get(phoneNumber)
  if (storedCode === inputCode) {
    // Код верный
    return true
  } else {
    // Код неверный
    return false
  }
}

async function saveCodeToRedis(phoneNumber, code, ttl = 600) {
  await redisClient.set(phoneNumber, code)
  await redisClient.expire(phoneNumber, ttl)
}

async function sendSms(phoneNumber, message) {
  try {
    const response = await axios.post(
      'https://app.sms.by/api/v1/sendQuickSMS',
      {
        phone: phoneNumber,
        message: message,
        token: process.env.SMS_API_TOKEN,
        alphaname_id: process.env.SMS_ALPHA_NAME_ID,
      }
    )

    if (response.data.success) {
      console.log('Сообщение отправлено')
    } else {
      console.error('Ошибка отправки SMS:', response.data)
    }
  } catch (error) {
    console.error('Ошибка отправки запроса:', error)
  }
}

// Экспорт функций
module.exports = {
  generateVerificationCode,
  saveCodeToRedis,
  sendSms,
  verifyCode,
}
