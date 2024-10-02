const redis = require('redis')

// Подключение к Redis
const redisClient = redis.createClient({
  url: `redis://localhost:${process.env.REDIS_PORT}`, // Адрес Redis-сервера
})

redisClient.on('error', (err) => console.error('Ошибка Redis:', err))
redisClient.on('connect', () => {
  console.log('Успешно подключено к Redis!')
})

// Подключение к Redis
redisClient.connect()

module.exports = { redisClient }
