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

/**
 * @swagger
 * /transactions/defect:
 *   post:
 *     summary: Запись дефекта
 *     description: Эндпоинт для записи дефекта товаров. Принимает массив товаров (обоев или дополнительных товаров) и уменьшает их количество на складе. Создает транзакцию с типом "defect" и записывает изменения в таблицу transaction_items.
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
 *             $ref: '#/components/schemas/defectRequest'
 *     responses:
 *       200:
 *         description: Дефект успешно записан.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Дефект успешно записан.
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
 *         description: Ошибка записи дефекта
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Ошибка записи дефекта.
 *                 error:
 *                   type: string
 *                   example: Обои с артиклем 123ABC и партией Batch01 не найдены.
 */
router.post(
  '/defect',
  authenticateAndAuthorize('admin', 'manager'),
  async (req, res) => {
    const { items } = req.body

    if (!Array.isArray(items) || items.length === 0) {
      return res
        .status(400)
        .json({ message: 'Необходимо передать массив товаров.' })
    }

    const client = await pool.connect()

    try {
      // Начинаем транзакцию
      await client.query('BEGIN')

      // Создаем запись в таблице transactions с типом 'defect' и discount = 0
      const transactionResult = await client.query(
        `INSERT INTO transactions (type, discount) VALUES ('defect', 0) RETURNING transactions_id`
      )
      const transactionId = transactionResult.rows[0].transactions_id

      // Обрабатываем каждый товар из списка
      for (const item of items) {
        if (item.type === 'wallpaper') {
          const { article, batch, quantity } = item

          // Получаем информацию о товаре (обоях) из базы, включая цену и себестоимость
          const wallpaperResult = await client.query(
            `SELECT w.wallpapers_id, w.price, w.quantity, w.cost_price
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

          // Уменьшаем количество товара
          if (wallpaper.quantity < quantity) {
            throw new Error(
              `Недостаточно обоев с артиклем ${article} и партией ${batch}.`
            )
          }

          // Обновляем количество товара на складе
          await client.query(
            `UPDATE wallpapers SET quantity = quantity - $1 WHERE wallpapers_id = $2`,
            [quantity, wallpaper.wallpapers_id]
          )

          // Записываем запись в transaction_items для обоев
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
        } else if (item.type === 'additional_product') {
          const { name, quantity } = item

          // Получаем информацию о дополнительном товаре из базы, включая цену и себестоимость
          const additionalProductResult = await client.query(
            `SELECT additional_products_id, price, quantity, cost_price
             FROM additional_products
             WHERE name = $1`,
            [name]
          )

          if (additionalProductResult.rowCount === 0) {
            throw new Error(`Дополнительный товар с именем ${name} не найден.`)
          }

          const additionalProduct = additionalProductResult.rows[0]

          // Уменьшаем количество товара
          if (additionalProduct.quantity < quantity) {
            throw new Error(`Недостаточно товара ${name} для уменьшения.`)
          }

          // Обновляем количество товара на складе
          await client.query(
            `UPDATE additional_products SET quantity = quantity - $1 WHERE additional_products_id = $2`,
            [quantity, additionalProduct.additional_products_id]
          )

          // Записываем запись в transaction_items для дополнительного товара
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
        } else {
          throw new Error(`Неизвестный тип товара: ${item.type}`)
        }
      }

      // Завершаем транзакцию
      await client.query('COMMIT')

      res.status(200).json({ message: 'Дефект успешно записан.' })
    } catch (error) {
      await client.query('ROLLBACK')
      console.error('Ошибка записи дефекта:', error)
      res
        .status(500)
        .json({ message: 'Ошибка записи дефекта.', error: error.message })
    } finally {
      client.release()
    }
  }
)




/**
 * @swagger
 * /transactions/supply:
 *   post:
 *     summary: Запись новой поставки
 *     description: Эндпоинт для записи новой поставки товаров. Если товар с указанным article отсутствует в базе данных, он будет добавлен. Если товар существует, его данные обновляются. В таблице wallpapers записи создаются или обновляются в зависимости от наличия batch и wallpaper_type_id.
 *     tags:
 *       - Supplies
 *     security:
 *       - adminAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               supplier_id:
 *                 type: integer
 *                 description: ID поставщика.
 *                 example: 1
 *               products:
 *                 type: array
 *                 description: Массив товаров.
 *                 items:
 *                   type: object
 *                   properties:
 *                     article:
 *                       type: string
 *                       description: Уникальный артикул товара.
 *                       example: "A123"
 *                     description:
 *                       type: string
 *                       description: Описание товара.
 *                       example: "Stylish wallpaper"
 *                     base_material:
 *                       type: string
 *                       description: Основной материал.
 *                       example: "Vinyl"
 *                     embossing:
 *                       type: string
 *                       description: Тип тиснения.
 *                       example: "Textured"
 *                     manufacturer:
 *                       type: string
 *                       description: Производитель.
 *                       example: "Best Wallpapers Inc."
 *                     image_url:
 *                       type: string
 *                       description: URL изображения товара.
 *                       example: "https://example.com/images/a123.jpg"
 *                     image_3d_url:
 *                       type: string
 *                       description: URL 3D изображения товара.
 *                       example: "https://example.com/images/a123_3d.jpg"
 *                     type:
 *                       type: string
 *                       description: Тип товара (1.06 или 0.53).
 *                       enum:
 *                         - "1.06"
 *                         - "0.53"
 *                       example: "1.06"
 *                     batch:
 *                       type: string
 *                       description: Партия товара.
 *                       example: "B001"
 *                     shelf:
 *                       type: integer
 *                       description: Номер полки.
 *                       example: 5
 *                     row:
 *                       type: integer
 *                       description: Номер ряда.
 *                       example: 3
 *                     quantity:
 *                       type: integer
 *                       description: Количество товара.
 *                       example: 20
 *                     cost_price:
 *                       type: integer
 *                       description: Себестоимость товара.
 *                       example: 100
 *     responses:
 *       201:
 *         description: Поставка успешно записана.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Поставка успешно записана.
 *                 products:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       article:
 *                         type: string
 *                         description: Артикул товара.
 *                         example: "A123"
 *                       wallpaper_type_id:
 *                         type: integer
 *                         description: ID типа обоев.
 *                         example: 10
 *                       updated_quantity:
 *                         type: integer
 *                         description: Обновленное количество товара.
 *                         example: 50
 *                       new_wallpapers_id:
 *                         type: integer
 *                         description: ID новой записи в таблице wallpapers (если создана).
 *                         example: 101
 *       400:
 *         description: Ошибка валидации данных.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Неверные данные в запросе.
 *       500:
 *         description: Внутренняя ошибка сервера.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Не удалось записать поставку.
 *                 error:
 *                   type: string
 *                   example: Ошибка подключения к базе данных.
 */

router.post(
  '/supply',
  authenticateAndAuthorize('admin', 'manager'),
  async (req, res) => {
    console.log(1)
    const client = await pool.connect();
    console.log(2)
    try {
      const { supplier_id, products } = req.body;
      console.log(3)
      console.log(supplier_id)
      console.log(Array.isArray(products))
      console.log(products.length)

      if (!supplier_id || !Array.isArray(products) || products.length === 0) {
        return res.status(400).json({ message: 'Неверные данные для создания поставки' });
      }
      console.log(4)

      await client.query('BEGIN'); // Начинаем транзакцию

      for (const product of products) {
        const {
          article,
          description,
          base_material,
          embossing,
          manufacturer,
          image_url,
          image_3d_url,
          type,
          batch,
          shelf,
          row,
          quantity,
          cost_price,
        } = product;

        console.log(5)

        // Рассчитываем цену как 1.5 * cost_price
        const price = Math.round(cost_price * 1.5);

        // Проверяем наличие записи в wallpaper_types
        const wallpaperTypeResult = await client.query(
          `
            INSERT INTO wallpaper_types (
              article, description, base_material, embossing, manufacturer, 
              image_url, image_3d_url, type, supplier_id
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            ON CONFLICT (article) DO UPDATE SET
              description = EXCLUDED.description,
              base_material = EXCLUDED.base_material,
              embossing = EXCLUDED.embossing,
              manufacturer = EXCLUDED.manufacturer,
              image_url = EXCLUDED.image_url,
              image_3d_url = EXCLUDED.image_3d_url,
              type = EXCLUDED.type
            RETURNING wallpaper_type_id
          `,
          [article, description, base_material, embossing, manufacturer, image_url, image_3d_url, type, supplier_id]
        );

        console.log(6)
        const wallpaperTypeId = wallpaperTypeResult.rows[0].wallpaper_type_id;

        // Проверяем наличие записи в wallpapers
        const wallpaperResult = await client.query(
          `
            SELECT wallpaper_id, quantity
            FROM wallpapers
            WHERE wallpaper_type_id = $1 AND batch = $2
          `,
          [wallpaperTypeId, batch]
        );

        console.log(7)
        if (wallpaperResult.rowCount > 0) {
          // Обновляем существующую запись
          const existingWallpaper = wallpaperResult.rows[0];
          await client.query(
            `
              UPDATE wallpapers
              SET
                shelf = $1,
                row = $2,
                quantity = quantity + $3,
                cost_price = $4,
                price = $5
              WHERE wallpaper_id = $6
            `,
            [shelf, row, quantity, cost_price, price, existingWallpaper.wallpaper_id]
          );
          console.log(8)
        } else {
          // Создаем новую запись
          await client.query(
            `
              INSERT INTO wallpapers (
                wallpaper_type_id, batch, shelf, row, quantity, price, cost_price
              )
              VALUES ($1, $2, $3, $4, $5, $6, $7)
            `,
            [wallpaperTypeId, batch, shelf, row, quantity, price, cost_price]
          );
          console.log(9)
        }

        // Обновляем price для всех записей с is_remaining = false
        await client.query(
          `
            UPDATE wallpapers
            SET price = $1
            WHERE wallpaper_type_id = $2 AND is_remaining = false
          `,
          [price, wallpaperTypeId]
        );
        console.log(10)
      }

      console.log(11)
      await client.query('COMMIT'); // Фиксируем транзакцию
      res.status(200).json({ message: 'Поставка успешно добавлена' });
    } catch (error) {
      await client.query('ROLLBACK'); // Откатываем транзакцию в случае ошибки
      console.error('Ошибка добавления поставки:', error);
      res.status(500).json({ message: 'Ошибка добавления поставки' });
    } finally {
      console.log(12)
      client.release();
    }
  }
);


module.exports = router



