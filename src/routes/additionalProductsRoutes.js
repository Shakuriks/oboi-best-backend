const express = require('express')
const { pool } = require('../services/dbService')
const router = express.Router()

/**
 * @swagger
 * /additional-products:
 *   get:
 *     summary: Получить все дополнительные товары
 *     tags:
 *       - Additional Products
 *     responses:
 *       200:
 *         description: Успешное получение списка дополнительных товаров
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/AdditionalProduct'
 *       500:
 *         description: Ошибка получения данных
 */ router.get('/', async (req, res) => {
  const client = await pool.connect()
  try {
    const result = await client.query('SELECT * FROM additional_products')
    res.status(200).json(result.rows)
  } catch (error) {
    console.error('Ошибка получения данных:', error)
    res.status(500).json({ message: 'Ошибка получения данных.' })
  } finally {
    client.release()
  }
})

/**
 * @swagger
 * /additional-products/{additional_products_id}:
 *   get:
 *     summary: Получить дополнительный товар по ID
 *     tags:
 *       - Additional Products
 *     parameters:
 *       - in: path
 *         name: additional_products_id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID дополнительного товара
 *     responses:
 *       200:
 *         description: Успешное получение дополнительного товара
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AdditionalProduct'
 *       404:
 *         description: Товар не найден
 *       500:
 *         description: Ошибка получения данных
 */
router.get('/:additional_products_id', async (req, res) => {
  const { additional_products_id } = req.params
  const client = await pool.connect()
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
  } finally {
    client.release()
  }
})

/**
 * @swagger
 * /additional-products/{additional_products_id}:
 *   put:
 *     summary: Обновить дополнительный товар
 *     tags:
 *       - Additional Products
 *     parameters:
 *       - in: path
 *         name: additional_products_id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID дополнительного товара
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               price:
 *                 type: number
 *             required:
 *               - name
 *               - price
 *     responses:
 *       200:
 *         description: Товар успешно обновлен
 *       404:
 *         description: Товар не найден
 *       500:
 *         description: Ошибка обновления товара
 */
router.put('/:additional_products_id', async (req, res) => {
  const { additional_products_id } = req.params
  const { name, price } = req.body
  const client = await pool.connect()

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
  } finally {
    client.release()
  }
})

/**
 * @swagger
 * /additional-products/{additional_products_id}:
 *   delete:
 *     summary: Удалить дополнительный товар
 *     tags:
 *       - Additional Products
 *     parameters:
 *       - in: path
 *         name: additional_products_id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID дополнительного товара
 *     responses:
 *       200:
 *         description: Товар успешно удален
 *       400:
 *         description: Нельзя удалить товар, у которого количество больше 0
 *       404:
 *         description: Товар не найден
 *       500:
 *         description: Ошибка удаления товара
 */ router.delete('/:additional_products_id', async (req, res) => {
  const { additional_products_id } = req.params
  const client = await pool.connect()

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
  } finally {
    client.release()
  }
})

module.exports = router
