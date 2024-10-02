const express = require('express')
require('dotenv').config()
const { client } = require('./services/dbService')
const authRoutes = require('./routes/authRoutes')
const suppliersRoutes = require('./routes/suppliersRoutes')
const wallpaperTypesRoutes = require('./routes/wallpaperTypesRoutes')
const swaggerUi = require('swagger-ui-express')
const swaggerJsdoc = require('swagger-jsdoc')
const swaggerConfig = require('../swaggerConfig') // Подключаем конфигурацию Swagger
const verificationRoutes = require('./routes/verificationCodeRoutes') // Путь к вашему файлу маршрутов
const additionalProductsRoutes = require('./routes/additionalProductsRoutes')

const app = express()
app.use(express.json())

// Конфигурация swagger-jsdoc для описания эндпоинтов
const swaggerOptions = {
  definition: {
    ...swaggerConfig,
    openapi: '3.0.0', // Убедитесь, что версия OpenAPI соответствует вашим требованиям
  },
  apis: ['./src/routes/*.js'], // Путь к вашим маршрутам
}

// Создаем спецификацию Swagger
const swaggerSpec = swaggerJsdoc(swaggerOptions)

// Swagger UI
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec))

// Маршруты для авторизации
app.use('/auth', authRoutes)
app.use('/wallpaper-types', wallpaperTypesRoutes) // Эндпоинт для wallpaper_types
app.use('/verification', verificationRoutes)
app.use('/suppliers', suppliersRoutes)
app.use('/additional-products', additionalProductsRoutes)

// Запуск сервера
const PORT = process.env.PORT || 4000
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)
})
