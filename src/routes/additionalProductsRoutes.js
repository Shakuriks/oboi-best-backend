const express = require('express')
const { client } = require('../services/dbService')
const router = express.Router()

/**
 * @swagger
 * /auth/register:
 *   post:
 *     summary: Регистрация нового пользователя
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
 *               $ref: '#/components/schemas/ErrorResponse'
 */ router.get('/', async (req, res) => {
  try {
    const result = await client.query('SELECT * FROM additional_products')
    res.status(200).json(result.rows)
  } catch (error) {
    console.error('Ошибка получения данных:', error)
    res.status(500).json({ message: 'Ошибка получения данных.' })
  }
})

// Эндпоинт для получения данных конкретной строки по id
router.get('/:additional_products_id', async (req, res) => {
  const { additional_products_id } = req.params
  try {
    const result = await client.query(
      'SELECT * FROM additional_products WHERE additional_products_id = $1',
      [additional_products_id]
    )
    if (result.rowCount === 0) {
      return res.status(404).json({ message: 'Товар не найден' })
    }
    res.status(200).json(result.rows[0])
  } catch (error) {
    console.error('Ошибка получения данных:', error)
    res.status(500).json({ message: 'Ошибка получения данных.' })
  }
})

// Эндпоинт для изменения дополнительного товара (только name и price)
router.put('/:additional_products_id', async (req, res) => {
  const { additional_products_id } = req.params
  const { name, price } = req.body
  try {
    const result = await client.query(
      `UPDATE additional_products 
       SET name = $1, price = $2
       WHERE additional_products_id = $3`,
      [name, price, additional_products_id]
    )

    if (result.rowCount === 0) {
      return res.status(404).json({ message: 'Товар не найден' })
    }

    res.status(200).json({ message: 'Товар успешно обновлен' })
  } catch (error) {
    console.error('Ошибка обновления товара:', error)
    res.status(500).json({ message: 'Ошибка обновления товара.' })
  }
})

// Эндпоинт для удаления дополнительного товара (только если quantity = 0)
router.delete('/:additional_products_id', async (req, res) => {
  const { additional_products_id } = req.params
  try {
    // Проверяем количество товара
    const checkQuantityResult = await client.query(
      'SELECT quantity FROM additional_products WHERE additional_products_id = $1',
      [additional_products_id]
    )

    if (checkQuantityResult.rowCount === 0) {
      return res.status(404).json({ message: 'Товар не найден' })
    }

    const quantity = checkQuantityResult.rows[0].quantity

    if (quantity > 0) {
      return res.status(400).json({
        message: 'Нельзя удалить товар, у которого количество больше 0.',
      })
    }

    // Если количество = 0, удаляем товар
    const deleteResult = await client.query(
      'DELETE FROM additional_products WHERE additional_products_id = $1',
      [additional_products_id]
    )

    res.status(200).json({ message: 'Товар успешно удален' })
  } catch (error) {
    console.error('Ошибка удаления товара:', error)
    res.status(500).json({ message: 'Ошибка удаления товара.' })
  }
})

module.exports = router
