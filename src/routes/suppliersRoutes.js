const express = require('express')
const { pool } = require('../services/dbService') // Подключение к базе данных
const { authenticateAndAuthorize } = require('../middlewares/authMiddleware')

const router = express.Router()

/**
 * @swagger
 * /suppliers:
 *   get:
 *     summary: Получение всех поставщиков
 *     tags: [Suppliers]
 *     security:
 *       - adminAuth: []
 *       - managerAuth: []
 *     responses:
 *       200:
 *         description: Список всех поставщиков
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Supplier'
 *       500:
 *         description: Ошибка при получении поставщиков
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Ошибка при получении поставщиков"
 */
router.get(
  '/',
  authenticateAndAuthorize('admin', 'manager'),
  async (req, res) => {
    const client = await pool.connect()
    try {
      const result = await client.query('SELECT * FROM suppliers')
      res.status(200).json(result.rows)
    } catch (error) {
      console.error('Ошибка при получении поставщиков:', error)
      res.status(500).json({ message: 'Ошибка при получении поставщиков' })
    } finally {
      client.release()
    }
  }
)

/**
 * @swagger
 * /suppliers/{supplier_id}:
 *   get:
 *     summary: Получение поставщика по ID
 *     tags: [Suppliers]
 *     security:
 *       - adminAuth: []
 *       - managerAuth: []
 *     parameters:
 *       - name: supplier_id
 *         in: path
 *         required: true
 *         description: ID поставщика
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Данные поставщика
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Supplier'
 *       404:
 *         description: Поставщик не найден
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Поставщик не найден"
 *       500:
 *         description: Ошибка при получении поставщика
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Ошибка при получении поставщика"
 */
router.get(
  '/:supplier_id',
  authenticateAndAuthorize('admin', 'manager'),
  async (req, res) => {
    const { supplier_id } = req.params
    const client = await pool.connect()

    try {
      const result = await client.query(
        'SELECT * FROM suppliers WHERE supplier_id = $1',
        [supplier_id]
      )

      if (result.rowCount === 0) {
        return res.status(404).json({ message: 'Поставщик не найден' })
      }

      res.status(200).json(result.rows[0])
    } catch (error) {
      console.error('Ошибка при получении поставщика:', error)
      res.status(500).json({ message: 'Ошибка при получении поставщика' })
    } finally {
      client.release()
    }
  }
)

/**
 * @swagger
 * /suppliers/name/{name}:
 *   get:
 *     summary: Получение ID поставщика по имени
 *     tags: [Suppliers]
 *     security:
 *       - adminAuth: []
 *       - managerAuth: []
 *     parameters:
 *       - name: name
 *         in: path
 *         required: true
 *         description: Имя поставщика
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: ID поставщика
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 supplier_id:
 *                   type: integer
 *       404:
 *         description: Поставщик не найден
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Поставщик не найден"
 *       500:
 *         description: Ошибка при получении ID поставщика
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Ошибка при получении ID поставщика"
 */
router.get(
  '/name/:name',
  authenticateAndAuthorize('admin', 'manager'),
  async (req, res) => {
    const { name } = req.params
    const client = await pool.connect()

    try {
      const result = await client.query(
        'SELECT supplier_id FROM suppliers WHERE name = $1',
        [name]
      )

      if (result.rowCount === 0) {
        return res.status(404).json({ message: 'Поставщик не найден' })
      }

      res.status(200).json({ supplier_id: result.rows[0].supplier_id })
    } catch (error) {
      console.error('Ошибка при получении ID поставщика по имени:', error)
      res.status(500).json({ message: 'Ошибка при получении ID поставщика' })
    } finally {
      client.release()
    }
  }
)

module.exports = router
