const express = require('express')
const { pool } = require('../services/dbService')
const { authenticateAndAuthorize } = require('../middlewares/authMiddleware')

const router = express.Router()

/**
 * @swagger
 * /users:
 *   get:
 *     summary: Получение списка всех пользователей
 *     tags: [Users]
 *     security:
 *       - adminAuth: []
 *     responses:
 *       200:
 *         description: Список пользователей
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   users_id:
 *                     type: integer
 *                     description: ID пользователя
 *                     example: 1
 *                   phone_number:
 *                     type: string
 *                     description: Номер телефона пользователя
 *                     example: "+1234567890"
 *                   name:
 *                     type: string
 *                     description: Имя пользователя
 *                     example: "Иван Иванов"
 *                   role:
 *                     type: string
 *                     description: Роль пользователя
 *                     example: "admin"
 *       500:
 *         description: Ошибка получения списка пользователей
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Ошибка получения списка пользователей
 */

router.get('/', authenticateAndAuthorize('admin'), async (req, res) => {
  const client = await pool.connect()

  try {
    const result = await client.query(`
          SELECT users_id, phone_number, name, role
          FROM users
          ORDER BY users_id
        `)

    res.status(200).json(result.rows)
  } catch (error) {
    console.error('Ошибка получения списка пользователей:', error)

    // Логируем ошибку
    await client.query(
      `
          INSERT INTO logs (code, text)
          VALUES ($1, $2)
        `,
      [500, `Ошибка получения списка пользователей: ${error.message}`]
    )

    res.status(500).json({ message: 'Ошибка получения списка пользователей' })
  } finally {
    client.release()
  }
})

/**
 * @swagger
 * /users/set-manager-role/{user_id}:
 *   put:
 *     summary: Установка роли manager для пользователя
 *     tags: [Users]
 *     security:
 *       - adminAuth: []
 *     parameters:
 *       - in: path
 *         name: user_id
 *         schema:
 *           type: integer
 *         required: true
 *         description: ID пользователя
 *     responses:
 *       200:
 *         description: Роль пользователя успешно обновлена на manager
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Роль пользователя успешно обновлена на manager
 *       404:
 *         description: Пользователь не найден
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Пользователь не найден
 *       500:
 *         description: Ошибка обновления роли пользователя
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Ошибка обновления роли пользователя
 */
router.put(
  '/set-manager-role/:user_id',
  authenticateAndAuthorize('admin'),
  async (req, res) => {
    const client = await pool.connect()
    const { user_id } = req.params

    try {
      // Проверяем, существует ли пользователь с таким ID
      const userCheckResult = await client.query(
        `SELECT users_id FROM users WHERE users_id = $1`,
        [user_id]
      )

      if (userCheckResult.rowCount === 0) {
        return res.status(404).json({ message: 'Пользователь не найден' })
      }

      // Обновляем роль пользователя на 'manager'
      await client.query(
        `UPDATE users SET role = 'manager' WHERE users_id = $1`,
        [user_id]
      )

      // Логируем успешное обновление
      await client.query(
        `
          INSERT INTO logs (code, text)
          VALUES ($1, $2)
        `,
        [200, `Роль пользователя с ID ${user_id} изменена на manager`]
      )

      res
        .status(200)
        .json({ message: 'Роль пользователя успешно обновлена на manager' })
    } catch (error) {
      console.error('Ошибка обновления роли пользователя:', error)

      // Логируем ошибку
      await client.query(
        `
          INSERT INTO logs (code, text)
          VALUES ($1, $2)
        `,
        [
          500,
          `Ошибка обновления роли пользователя с ID ${user_id}: ${error.message}`,
        ]
      )

      res.status(500).json({ message: 'Ошибка обновления роли пользователя' })
    } finally {
      client.release()
    }
  }
)

/**
 * @swagger
 * /users/set-admin-role/{user_id}:
 *   put:
 *     summary: Установка роли admin для пользователя
 *     tags: [Users]
 *     security:
 *       - adminAuth: []
 *     parameters:
 *       - in: path
 *         name: user_id
 *         schema:
 *           type: integer
 *         required: true
 *         description: ID пользователя
 *     responses:
 *       200:
 *         description: Роль пользователя успешно обновлена на admin
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Роль пользователя успешно обновлена на admin
 *       404:
 *         description: Пользователь не найден
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Пользователь не найден
 *       500:
 *         description: Ошибка обновления роли пользователя
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Ошибка обновления роли пользователя
 */
router.put(
  '/users/set-admin-role/:user_id',
  authenticateAndAuthorize('admin'),
  async (req, res) => {
    const client = await pool.connect()
    const { user_id } = req.params

    try {
      // Проверяем, существует ли пользователь с таким ID
      const userCheckResult = await client.query(
        `SELECT users_id FROM users WHERE users_id = $1`,
        [user_id]
      )

      if (userCheckResult.rowCount === 0) {
        return res.status(404).json({ message: 'Пользователь не найден' })
      }

      // Обновляем роль пользователя на 'admin'
      await client.query(
        `UPDATE users SET role = 'admin' WHERE users_id = $1`,
        [user_id]
      )

      // Логируем успешное обновление
      await client.query(
        `
          INSERT INTO logs (code, text)
          VALUES ($1, $2)
        `,
        [200, `Роль пользователя с ID ${user_id} изменена на admin`]
      )

      res
        .status(200)
        .json({ message: 'Роль пользователя успешно обновлена на admin' })
    } catch (error) {
      console.error('Ошибка обновления роли пользователя:', error)

      // Логируем ошибку
      await client.query(
        `
          INSERT INTO logs (code, text)
          VALUES ($1, $2)
        `,
        [
          500,
          `Ошибка обновления роли пользователя с ID ${user_id}: ${error.message}`,
        ]
      )

      res.status(500).json({ message: 'Ошибка обновления роли пользователя' })
    } finally {
      client.release()
    }
  }
)

module.exports = router
