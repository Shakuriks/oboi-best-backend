const express = require('express')
require('dotenv').config()
const authRoutes = require('./routes/authRoutes')
const { authenticateToken } = require('./middlewares/authMiddleware')

const app = express()
app.use(express.json())

// Маршруты
app.use('/auth', authRoutes) // Авторизационные маршруты

// Пример защищенного ресурса
app.get('/protected', authenticateToken, (req, res) => {
  res.json({ message: 'This is a protected route.', user: req.user })
})

const PORT = process.env.PORT || 4000
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)
})
