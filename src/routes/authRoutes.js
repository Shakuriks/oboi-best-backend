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

/**
 * @swagger
 * /auth/register:
 *   post:
 *     summary: Регистрация нового пользователя
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RegisterRequest'
 *     responses:
 *       201:
 *         description: Успешная регистрация
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/User'
 *       500:
 *         description: Ошибка регистрации
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Ошибка регистрации. Попробуйте позже."
 */
router.post('/register', async (req, res) => {
  const { phone_number, password, name } = req.body
  const hashedPassword = await bcrypt.hash(password, 10)

  try {
    const result = await client.query(
      `
      INSERT INTO users (phone_number, password, name, role) VALUES ($1, $2, $3, $4) RETURNING *;
    `,
      [phone_number, hashedPassword, name, 'user']
    )
    res.status(201).json(result.rows[0])
  } catch (err) {
    console.error(err)
    res.status(500).send('Ошибка регистрации')
  }
})

/**
 * @swagger
 * /auth/login:
 *   post:
 *     summary: Вход пользователя
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/LoginRequest'
 *     responses:
 *       200:
 *         description: Успешный вход
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Tokens'
 *       403:
 *         description: Доступ запрещен
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Неверный номер телефона или пароль."
 *       500:
 *         description: Ошибка при входе
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Ошибка при входе. Попробуйте позже."
 */
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
      userId: user.users_id,
      name: user.name,
      role: user.role,
    })
    const refreshToken = generateRefreshToken({
      userId: user.users_id,
      name: user.name,
      role: user.role,
    })

    // Возвращаем токены и данные пользователя с userId
    res.json({
      accessToken,
      refreshToken,
      user: {
        userId: user.users_id, // Используем userId вместо id
        name: user.name,
        phone_number: user.phone_number,
        role: user.role,
        // Добавьте другие необходимые поля
      },
    })
  } catch (err) {
    console.error(err)
    res.status(500).send('Ошибка при входе')
  }
})

/**
 * @swagger
 * /auth/token:
 *   post:
 *     summary: Обновление токенов
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RefreshTokenRequest'
 *     responses:
 *       200:
 *         description: Успешное обновление токена
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Tokens'
 *       401:
 *         description: Не авторизован
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Необходим токен."
 *       403:
 *         description: Токен недействителен
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Токен недействителен."
 *       500:
 *         description: Ошибка обновления токена
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Ошибка обновления токена. Попробуйте позже."
 */
router.post('/token', async (req, res) => {
  const { token } = req.body
  if (!token) return res.sendStatus(401) // Не авторизован

  // Проверка на валидность токена в базе данных
  const isValid = await verifyRefreshToken(token)
  if (!isValid) return res.sendStatus(403) // Запрещено

  // Верификация самого токена
  jwt.verify(token, process.env.REFRESH_TOKEN_SECRET, async (err, user) => {
    if (err) return res.sendStatus(403) // Запрещено

    // Генерация нового access токена, включая role пользователя
    const accessToken = generateAccessToken({
      userId: user.userId, // Используем userId
      name: user.name,
      role: user.role, // Добавляем роль в токен
    })

    // Генерация нового refresh токена, включая role пользователя
    const newRefreshToken = generateRefreshToken({
      userId: user.userId, // Используем userId
      name: user.name,
      role: user.role, // Добавляем роль в токен
    })

    // Удаление старого токена из базы данных
    await removeRefreshToken(token)

    // Сохранение нового refresh токена в базе данных
    await saveRefreshToken(newRefreshToken, user.userId)

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

/**
 * @swagger
 * /auth/logout:
 *   delete:
 *     summary: Выход пользователя из системы
 *     description: Удаляет refresh токен пользователя, завершает его сессию.
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RefreshTokenRequest'
 *     responses:
 *       204:
 *         description: Успешный выход
 */
router.delete('/logout', async (req, res) => {
  const { token } = req.body
  await revokeRefreshToken(token)
  res.sendStatus(204)
})

module.exports = router
