const express = require('express')
const bcrypt = require('bcrypt')
const {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
  removeRefreshToken,
  saveRefreshToken,
} = require('../services/tokenService')
const { client } = require('../services/dbService')

const router = express.Router()

router.post('/register', async (req, res) => {
  const { phone_number, password, name, role } = req.body
  const hashedPassword = await bcrypt.hash(password, 10)

  try {
    const result = await client.query(
      `
      INSERT INTO users (phone_number, password, name, role) VALUES ($1, $2, $3, $4) RETURNING *;
    `,
      [phone_number, hashedPassword, name, role]
    )
    res.status(201).json(result.rows[0])
  } catch (err) {
    console.error(err)
    res.status(500).send('Ошибка регистрации')
  }
})

router.post('/login', async (req, res) => {
  const { phone_number, password } = req.body

  try {
    const result = await client.query(
      'SELECT * FROM users WHERE phone_number = $1;',
      [phone_number]
    )
    const user = result.rows[0]

    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.sendStatus(403)
    }

    const accessToken = generateAccessToken({
      id: user.users_id,
      name: user.name,
    })
    const refreshToken = generateRefreshToken({
      id: user.users_id,
      name: user.name,
    })
    res.json({ accessToken, refreshToken })
  } catch (err) {
    console.error(err)
    res.status(500).send('Ошибка при входе')
  }
})

router.post('/token', async (req, res) => {
  const { token } = req.body
  if (!token) return res.sendStatus(401) // Не авторизован

  // Проверка на валидность токена в базе данных
  const isValid = await verifyRefreshToken(token)
  if (!isValid) return res.sendStatus(403) // Запрещено

  // Верификация самого токена
  jwt.verify(token, process.env.REFRESH_TOKEN_SECRET, async (err, user) => {
    if (err) return res.sendStatus(403) // Запрещено

    // Генерация нового access токена
    const accessToken = generateAccessToken({ id: user.id, name: user.name })

    // Генерация нового refresh токена
    const newRefreshToken = generateRefreshToken({
      id: user.id,
      name: user.name,
    })

    // Удаление старого токена из базы данных
    await removeRefreshToken(token)

    // Сохранение нового refresh токена в базе данных
    await saveRefreshToken(newRefreshToken, user.id)

    // Установка нового refresh токена в cookie
    res.cookie('refreshToken', newRefreshToken, {
      httpOnly: true,
      secure: true, // Используйте только с HTTPS
      sameSite: 'strict',
      maxAge: 6 * 30 * 24 * 60 * 60 * 1000, // 6 месяцев
    })

    // Возвращаем новый access токен клиенту
    res.json({ accessToken })
  })
})

router.delete('/logout', async (req, res) => {
  const { token } = req.body
  await revokeRefreshToken(token)
  res.sendStatus(204)
})

module.exports = router
