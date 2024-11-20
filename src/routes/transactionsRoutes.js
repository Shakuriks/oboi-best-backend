const express = require('express')
const { pool } = require('../services/dbService')
const { generateInvoice } = require('../services/invoiceService')
const { authenticateAndAuthorize } = require('../middlewares/authMiddleware')
const path = require('path')
const fs = require('fs')

const router = express.Router()

/**
 * @swagger
 * /transactions/purchase:
 *   post:
 *     summary: Запись покупки
 *     description: Эндпоинт для записи покупки. Принимает массив товаров (обоев или дополнительных товаров) и скидку. Создает транзакцию и обновляет количество товаров на складе.
 *     tags:
 *       - Transactions
 *     security:
 *       - adminAuth: []
 *       - managerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/purchaseRequest'
 *     responses:
 *       200:
 *         description: Покупка успешно записана, если указан параметр printReceipt, то возвращается чек в виде PDF.
 *         content:
 *           application/pdf:
 *             schema:
 *               type: string
 *               format: binary
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Покупка успешно записана.
 *       400:
 *         description: Ошибка валидации данных
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Необходимо передать массив товаров.
 *       500:
 *         description: Ошибка записи покупки
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Ошибка записи покупки.
 *                 error:
 *                   type: string
 *                   example: Недостаточно товара.
 */

//доработать для печати чека
router.post(
  '/purchase',
  authenticateAndAuthorize('admin', 'manager'),
  async (req, res) => {
    const { items, discount, printReceipt } = req.body

    if (!Array.isArray(items) || items.length === 0) {
      return res
        .status(400)
        .json({ message: 'Необходимо передать массив товаров.' })
    }

    const client = await pool.connect()

    try {
      // Начинаем транзакцию
      await client.query('BEGIN')

      // Создаем запись в таблице transactions
      const transactionResult = await client.query(
        `INSERT INTO transactions (type, discount) VALUES ('purchase', $1) RETURNING transactions_id`,
        [discount]
      )
      const transactionId = transactionResult.rows[0].transactions_id

      for (const item of items) {
        if (item.type === 'wallpaper') {
          const { article, batch, quantity } = item

          // Получаем запись из таблицы wallpapers и wallpaper_types
          const wallpaperResult = await client.query(
            `SELECT w.wallpapers_id, w.price, w.cost_price, w.quantity, wt.wallpaper_types_id
             FROM wallpapers w
             JOIN wallpaper_types wt ON wt.wallpaper_types_id = w.wallpaper_type_id
             WHERE wt.article = $1 AND w.batch = $2`,
            [article, batch]
          )

          if (wallpaperResult.rowCount === 0) {
            throw new Error(
              `Обои с артиклем ${article} и партией ${batch} не найдены.`
            )
          }

          const wallpaper = wallpaperResult.rows[0]

          // Проверяем наличие достаточного количества
          if (wallpaper.quantity < quantity) {
            throw new Error(
              `Недостаточно обоев с артиклем ${article} и партией ${batch}.`
            )
          }

          // Обновляем количество в таблице wallpapers
          await client.query(
            `UPDATE wallpapers SET quantity = quantity - $1 WHERE wallpapers_id = $2`,
            [quantity, wallpaper.wallpapers_id]
          )

          // Создаем запись в таблице transaction_items для обоев
          await client.query(
            `INSERT INTO transaction_items 
             (transaction_id, item_table, item_id, price, cost_price, quantity) 
             VALUES ($1, 'wallpapers', $2, $3, $4, $5)`,
            [
              transactionId,
              wallpaper.wallpapers_id,
              wallpaper.price,
              wallpaper.cost_price,
              quantity,
            ]
          )
          item.price = wallpaper.price
        } else if (item.type === 'additional_product') {
          const { name, quantity } = item

          // Получаем запись из таблицы additional_products
          const additionalProductResult = await client.query(
            `SELECT additional_products_id, price, cost_price, quantity
             FROM additional_products
             WHERE name = $1`,
            [name]
          )

          if (additionalProductResult.rowCount === 0) {
            throw new Error(`Дополнительный товар с именем ${name} не найден.`)
          }

          const additionalProduct = additionalProductResult.rows[0]

          // Проверяем наличие достаточного количества
          if (additionalProduct.quantity < quantity) {
            throw new Error(`Недостаточно товара ${name}.`)
          }

          // Обновляем количество в таблице additional_products
          await client.query(
            `UPDATE additional_products SET quantity = quantity - $1 WHERE additional_products_id = $2`,
            [quantity, additionalProduct.additional_products_id]
          )

          // Создаем запись в таблице transaction_items для дополнительного товара
          await client.query(
            `INSERT INTO transaction_items 
             (transaction_id, item_table, item_id, price, cost_price, quantity) 
             VALUES ($1, 'additional_products', $2, $3, $4, $5)`,
            [
              transactionId,
              additionalProduct.additional_products_id,
              additionalProduct.price,
              additionalProduct.cost_price,
              quantity,
            ]
          )
          item.price = additionalProduct.price
        } else {
          throw new Error(`Неизвестный тип товара: ${item.type}`)
        }
      }

      // Завершаем транзакцию
      await client.query('COMMIT')

      // Если необходимо напечатать чек
      if (printReceipt) {
        // Генерация PDF в памяти
        const pdfBytes = await generateInvoice(items, discount)
        // Путь к файлу на сервере
        const filePath = path.join(__dirname, 'invoice.pdf')

        // Сохраняем PDF в файл
        fs.writeFileSync(filePath, pdfBytes)

        // Устанавливаем заголовок и отправляем PDF в ответ
        res.set({
          'Content-Type': 'application/pdf',
          'Content-Disposition': 'attachment; filename=invoice.pdf',
        })
        res.sendFile(filePath, (err) => {
          // Удаляем файл после отправки
          fs.unlink(filePath, (err) => {
            if (err) console.error('Ошибка при удалении файла:', err)
          })
        })
      } else {
        res.status(200).json({ message: 'Покупка успешно записана.' })
      }
    } catch (error) {
      await client.query('ROLLBACK')
      console.error('Ошибка записи покупки:', error)
      res
        .status(500)
        .json({ message: 'Ошибка записи покупки.', error: error.message })
    } finally {
      client.release()
    }
  }
)

/**
 * @swagger
 * /transactions/return:
 *   post:
 *     summary: Запись возврата
 *     description: Эндпоинт для записи возврата товаров. Принимает массив товаров (обоев или дополнительных товаров) и общую сумму возврата. Создает транзакцию и обновляет количество товаров на складе.
 *     tags:
 *       - Transactions
 *     security:
 *       - adminAuth: []
 *       - managerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/returnRequest'
 *     responses:
 *       200:
 *         description: Возврат успешно записан.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Возврат успешно записан.
 *       400:
 *         description: Ошибка валидации данных
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Необходимо передать массив товаров.
 *       500:
 *         description: Ошибка записи возврата
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Ошибка записи возврата.
 *                 error:
 *                   type: string
 *                   example: Обои с артиклем abc и партией 123 не найдены.
 */
router.post(
  '/return',
  authenticateAndAuthorize('admin', 'manager'),
  async (req, res) => {
    const { items, totalPrice } = req.body

    if (!Array.isArray(items) || items.length === 0) {
      return res
        .status(400)
        .json({ message: 'Необходимо передать массив товаров.' })
    }

    const client = await pool.connect()

    try {
      // Начинаем транзакцию
      await client.query('BEGIN')

      // Создаем запись в таблице transactions с discount=0
      const transactionResult = await client.query(
        `INSERT INTO transactions (type, discount) VALUES ('return', 0) RETURNING transactions_id`
      )
      const transactionId = transactionResult.rows[0].transactions_id

      let dbTotalPrice = 0
      let wallpaperCount = 0

      // Считаем общую цену из базы и количество товаров типа wallpaper
      for (const item of items) {
        if (item.type === 'wallpaper') {
          const { article, batch, quantity } = item
          wallpaperCount += quantity // Прибавляем quantity товаров типа wallpaper

          // Получаем цену и количество обоев из базы
          const wallpaperResult = await client.query(
            `SELECT w.wallpapers_id, w.price, w.cost_price, w.quantity, wt.wallpaper_types_id
             FROM wallpapers w
             JOIN wallpaper_types wt ON wt.wallpaper_types_id = w.wallpaper_type_id
             WHERE wt.article = $1 AND w.batch = $2`,
            [article, batch]
          )

          if (wallpaperResult.rowCount === 0) {
            throw new Error(
              `Обои с артиклем ${article} и партией ${batch} не найдены.`
            )
          }

          const wallpaper = wallpaperResult.rows[0]

          // Увеличиваем общую цену из базы
          dbTotalPrice += wallpaper.price * quantity

          // Сохраняем цену в объекте item
          item.price = wallpaper.price
        } else if (item.type === 'additional_product') {
          const { name, quantity } = item

          // Получаем цену и количество дополнительного товара из базы
          const additionalProductResult = await client.query(
            `SELECT additional_products_id, price, cost_price, quantity
             FROM additional_products
             WHERE name = $1`,
            [name]
          )

          if (additionalProductResult.rowCount === 0) {
            throw new Error(`Дополнительный товар с именем ${name} не найден.`)
          }

          const additionalProduct = additionalProductResult.rows[0]

          // Увеличиваем общую цену из базы
          dbTotalPrice += additionalProduct.price * quantity

          // Сохраняем цену в объекте item
          item.price = additionalProduct.price
        } else {
          throw new Error(`Неизвестный тип товара: ${item.type}`)
        }
      }

      // Проверяем разницу между переданной и вычисленной ценой
      const priceDifference = totalPrice - dbTotalPrice
      const itemCountForAdjustment =
        wallpaperCount > 0
          ? wallpaperCount
          : items.reduce((sum, item) => sum + item.quantity, 0)

      if (priceDifference !== 0 && itemCountForAdjustment > 0) {
        const priceAdjustment = priceDifference / itemCountForAdjustment

        // Распределяем разницу между выбранными товарами
        for (const item of items) {
          if (wallpaperCount > 0 && item.type !== 'wallpaper') continue
          item.price += priceAdjustment
        }
      }

      // Создаем записи в таблице transaction_items
      for (const item of items) {
        if (item.type === 'wallpaper') {
          const { article, batch, quantity, price } = item

          // Получаем данные обоев из базы данных, включая cost_price
          const wallpaperResult = await client.query(
            `SELECT w.wallpapers_id, w.price, w.cost_price, w.quantity, wt.wallpaper_types_id
             FROM wallpapers w
             JOIN wallpaper_types wt ON wt.wallpaper_types_id = w.wallpaper_type_id
             WHERE wt.article = $1 AND w.batch = $2`,
            [article, batch]
          )

          const wallpaper = wallpaperResult.rows[0]

          // Обновляем количество на складе
          await client.query(
            `UPDATE wallpapers SET quantity = quantity + $1 WHERE wallpapers_id = $2`,
            [quantity, wallpaper.wallpapers_id]
          )

          // Записываем transaction_items
          await client.query(
            `INSERT INTO transaction_items 
             (transaction_id, item_table, item_id, price, cost_price, quantity) 
             VALUES ($1, 'wallpapers', $2, $3, $4, $5)`,
            [
              transactionId,
              wallpaper.wallpapers_id,
              price,
              wallpaper.cost_price,
              quantity,
            ]
          )
        } else if (item.type === 'additional_product') {
          const { name, quantity, price } = item

          // Получаем данные дополнительного товара из базы данных, включая cost_price
          const additionalProductResult = await client.query(
            `SELECT additional_products_id, price, cost_price, quantity
             FROM additional_products
             WHERE name = $1`,
            [name]
          )

          const additionalProduct = additionalProductResult.rows[0]

          // Обновляем количество на складе
          await client.query(
            `UPDATE additional_products SET quantity = quantity + $1 WHERE additional_products_id = $2`,
            [quantity, additionalProduct.additional_products_id]
          )

          // Записываем transaction_items
          await client.query(
            `INSERT INTO transaction_items 
             (transaction_id, item_table, item_id, price, cost_price, quantity) 
             VALUES ($1, 'additional_products', $2, $3, $4, $5)`,
            [
              transactionId,
              additionalProduct.additional_products_id,
              price,
              additionalProduct.cost_price,
              quantity,
            ]
          )
        }
      }

      // Завершаем транзакцию
      await client.query('COMMIT')

      res.status(200).json({ message: 'Возврат успешно записан.' })
    } catch (error) {
      await client.query('ROLLBACK')
      console.error('Ошибка записи возврата:', error)
      res
        .status(500)
        .json({ message: 'Ошибка записи возврата.', error: error.message })
    } finally {
      client.release()
    }
  }
)

module.exports = router
