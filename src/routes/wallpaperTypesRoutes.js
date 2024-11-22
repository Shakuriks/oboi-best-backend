const express = require('express')
const { pool } = require('../services/dbService')
const { authenticateAndAuthorize } = require('../middlewares/authMiddleware')

const router = express.Router()

/**
 * @swagger
 * /wallpaper-types:
 *   get:
 *     summary: Получение всех типов обоев
 *     tags: [Wallpapers]
 *     security:
 *       - adminAuth: []
 *       - managerAuth: []
 *     responses:
 *       200:
 *         description: Список типов обоев
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/wallpapersTypesListBySuppliers'
 *       500:
 *         description: Ошибка получения записей
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Ошибка получения записей
 */
router.get(
  '/',
  authenticateAndAuthorize('admin', 'manager'),
  async (req, res) => {
    const client = await pool.connect()
    try {
      const result = await client.query(`
        SELECT wt.*, s.name AS supplier_name
        FROM wallpaper_types wt
        JOIN suppliers s ON wt.supplier_id = s.suppliers_id
        ORDER BY s.name, wt.created_at, wt.article
      `)

      // Группируем товары по поставщику
      const suppliersProducts = result.rows.reduce((acc, row) => {
        const supplierId = row.supplier_id
        if (!acc[supplierId]) {
          acc[supplierId] = {
            supplier_name: row.supplier_name,
            products: [],
          }
        }
        // Добавляем товар в массив продуктов поставщика
        acc[supplierId].products.push(row)
        return acc
      }, {})

      // Преобразуем объект в массив
      const response = Object.values(suppliersProducts)

      res.json(response)
    } catch (error) {
      console.error('Ошибка получения записей:', error)
      res.status(500).json({ message: 'Ошибка получения записей' })
    } finally {
      client.release()
    }
  }
)

/**
 * @swagger
 * /wallpaper-types/{wallpaper_types_id}:
 *   get:
 *     summary: Получение обоев по типу
 *     tags: [Wallpapers]
 *     security:
 *       - adminAuth: []
 *       - managerAuth: []
 *     parameters:
 *       - in: path
 *         name: wallpaper_types_id
 *         required: true
 *         description: ID типа обоев
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Список обоев по типу
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/wallpapersByType'
 *       404:
 *         description: Тип обоев не найден
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Тип обоев не найден
 *       500:
 *         description: Ошибка получения записей
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Ошибка получения записей
 */
router.get(
  '/:wallpaper_types_id',
  authenticateAndAuthorize('admin', 'manager'),
  async (req, res) => {
    const { wallpaper_types_id } = req.params // Извлекаем wallpaper_types_id из параметров
    const client = await pool.connect()

    try {
      // Получаем все записи из wallpapers по wallpaper_types_id и подсчитываем общее количество в активных бронированиях
      const result = await client.query(
        `SELECT w.*, 
                COALESCE(SUM(CASE WHEN r.status IN ('pending', 'processed') THEN ri.quantity ELSE 0 END), 0)::INTEGER AS total_reserved_quantity
         FROM wallpapers w
         LEFT JOIN reservation_items ri ON w.wallpapers_id = ri.item_id 
         LEFT JOIN reservations r ON ri.reservation_id = r.reservations_id 
         WHERE w.wallpaper_type_id = $1 
         GROUP BY w.wallpapers_id
         ORDER BY w.is_remaining ASC, w.created_at ASC`,
        [wallpaper_types_id]
      )

      // Возвращаем пустой массив, если записи не найдены
      res.json(result.rows || [])
    } catch (error) {
      console.error('Ошибка получения записей:', error)
      res.status(500).json({ message: 'Ошибка получения записей' })
    } finally {
      client.release()
    }
  }
)

/**
 * @swagger
 * /wallpaper-types/{wallpaper_id}:
 *   get:
 *     summary: Получение данных о товаре по ID
 *     tags: [Wallpapers]
 *     security:
 *       - adminAuth: []
 *       - managerAuth: []
 *     parameters:
 *       - in: path
 *         name: wallpaper_id
 *         required: true
 *         description: ID товара
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Данные о товаре и его типе
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/wallpaperById'
 *       404:
 *         description: Товар не найден
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Товар не найден
 *       500:
 *         description: Ошибка получения данных о товаре
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Ошибка получения данных о товаре
 */
router.get(
  '/:wallpaper_id',
  authenticateAndAuthorize('admin', 'manager'),
  async (req, res) => {
    const { wallpaper_id } = req.params
    const client = await pool.connect()

    try {
      // Выполняем запрос для получения данных товара и его типа
      const result = await client.query(
        `SELECT w.batch, w.shelf, w.row, w.price, 
                wt.article, wt.description, wt.supplier_id, 
                wt.base_material, wt.embossing, wt.manufacturer, 
                wt.image_url, wt.image_3d_url, wt.type
         FROM wallpapers w
         JOIN wallpaper_types wt ON w.wallpaper_type_id = wt.wallpaper_types_id
         WHERE w.wallpapers_id = $1`,
        [wallpaper_id]
      )

      // Проверяем, был ли найден товар
      if (result.rowCount === 0) {
        return res.status(404).json({ message: 'Товар не найден' })
      }

      // Возвращаем данные товара и его типа
      res.json(result.rows[0])
    } catch (error) {
      console.error('Ошибка получения данных о товаре:', error)
      res.status(500).json({ message: 'Ошибка получения данных о товаре' })
    } finally {
      client.release()
    }
  }
)

/**
 * @swagger
 * /wallpaper-types/{wallpaper_id}:
 *   delete:
 *     summary: Удаление товара по ID
 *     tags: [Wallpapers]
 *     security:
 *       - adminAuth: []
 *       - managerAuth: []
 *     parameters:
 *       - in: path
 *         name: wallpaper_id
 *         required: true
 *         description: ID товара
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Товар успешно удален
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Товар успешно удален
 *       404:
 *         description: Товар не найден
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Товар не найден
 *       400:
 *         description: Невозможно удалить товар
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Невозможно удалить товар, так как его количество или количество забронированных товаров больше 0
 *       500:
 *         description: Ошибка при удалении товара
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Ошибка при удалении товара
 */
router.delete(
  '/:wallpaper_id',
  authenticateAndAuthorize('admin', 'manager'),
  async (req, res) => {
    const { wallpaper_id } = req.params
    const client = await pool.connect()

    try {
      // Получаем информацию о товаре, включая wallpaper_type_id и quantity
      const wallpaperResult = await client.query(
        'SELECT wallpaper_type_id, quantity FROM wallpapers WHERE wallpapers_id = $1',
        [wallpaper_id]
      )

      if (wallpaperResult.rowCount === 0) {
        return res.status(404).json({ message: 'Товар не найден' })
      }

      const { wallpaper_type_id, quantity } = wallpaperResult.rows[0]

      // Получаем общее количество забронированных товаров
      const totalReservedResult = await client.query(
        `SELECT COALESCE(SUM(CASE WHEN r.status IN ('pending', 'processed') THEN ri.quantity ELSE 0 END), 0) AS total_reserved_quantity
         FROM wallpapers w
         LEFT JOIN reservation_items ri ON w.wallpapers_id = ri.item_id 
         LEFT JOIN reservations r ON ri.reservation_id = r.reservations_id 
         WHERE w.wallpaper_type_id = $1`,
        [wallpaper_type_id]
      )

      const totalReservedQuantity = parseInt(
        totalReservedResult.rows[0].total_reserved_quantity,
        10
      )

      // Проверяем, можно ли удалить товар
      if (quantity > 0 || totalReservedQuantity > 0) {
        return res.status(400).json({
          message:
            'Невозможно удалить товар, так как его количество или количество забронированных товаров больше 0',
        })
      }

      // Удаляем товар из таблицы wallpapers
      await client.query('DELETE FROM wallpapers WHERE wallpapers_id = $1', [
        wallpaper_id,
      ])

      // Проверяем, остались ли еще товары с таким wallpaper_type_id
      const countResult = await client.query(
        'SELECT COUNT(*) FROM wallpapers WHERE wallpaper_type_id = $1',
        [wallpaper_type_id]
      )

      const remainingCount = parseInt(countResult.rows[0].count, 10)

      // Если это был последний товар с таким wallpaper_type_id, удаляем и запись из wallpaper_types
      if (remainingCount === 0) {
        await client.query(
          'DELETE FROM wallpaper_types WHERE wallpaper_types_id = $1',
          [wallpaper_type_id]
        )
      }

      res.status(200).json({ message: 'Товар успешно удален' })
    } catch (error) {
      console.error('Ошибка при удалении товара:', error)
      res.status(500).json({ message: 'Ошибка при удалении товара' })
    } finally {
      client.release()
    }
  }
)

/**
 * @swagger
 * /wallpaper-types/{wallpaper_id}:
 *   put:
 *     summary: Обновление товара по ID
 *     tags: [Wallpapers]
 *     security:
 *       - adminAuth: []
 *       - managerAuth: []
 *     parameters:
 *       - in: path
 *         name: wallpaper_id
 *         required: true
 *         description: ID товара
 *         schema:
 *           type: integer
 *       - in: body
 *         name: body
 *         description: Обновляемые данные товара
 *         required: true
 *         schema:
 *            $ref: '#/components/schemas/updateWallpaperRequest'
 *     responses:
 *       200:
 *         description: Товар и его тип успешно обновлены
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Товар и его тип успешно обновлены
 *       404:
 *         description: Товар не найден
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Товар не найден
 *       500:
 *         description: Ошибка обновления товара
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Ошибка обновления товара и типа
 */
router.put(
  '/:wallpaper_id',
  authenticateAndAuthorize('admin', 'manager'),
  async (req, res) => {
    const { wallpaper_id } = req.params
    const {
      batch,
      shelf,
      row,
      price,
      article,
      description,
      supplier_id,
      base_material,
      embossing,
      manufacturer,
      image_url,
      image_3d_url,
      type,
    } = req.body
    const client = await pool.connect()

    try {
      // Получаем текущие данные товара из базы данных
      const wallpaperResult = await client.query(
        'SELECT wallpaper_type_id, price, is_remaining FROM wallpapers WHERE wallpapers_id = $1',
        [wallpaper_id]
      )

      if (wallpaperResult.rowCount === 0) {
        return res.status(404).json({ message: 'Товар не найден' })
      }

      const {
        wallpaper_type_id,
        price: currentPrice,
        is_remaining,
      } = wallpaperResult.rows[0]

      // Проверяем, изменилась ли цена
      if (price !== undefined && price !== currentPrice) {
        if (is_remaining === false) {
          // Если is_remaining = false, обновляем цену для всех товаров с таким же wallpaper_type_id и is_remaining = false
          await client.query(
            `UPDATE wallpapers 
             SET price = $1 
             WHERE wallpaper_type_id = $2 AND is_remaining = false`,
            [price, wallpaper_type_id]
          )
        } else if (is_remaining === true) {
          // Если is_remaining = true, обновляем цену только для текущего товара
          await client.query(
            `UPDATE wallpapers 
             SET price = $1 
             WHERE wallpapers_id = $2`,
            [price, wallpaper_id]
          )
        }
      }

      // Обновляем остальные данные товара в таблице wallpapers
      await client.query(
        `UPDATE wallpapers 
         SET batch = $1, shelf = $2, row = $3
         WHERE wallpapers_id = $4`,
        [batch, shelf, row, wallpaper_id]
      )

      // Обновляем данные типа обоев в таблице wallpaper_types
      await client.query(
        `UPDATE wallpaper_types 
         SET article = $1, description = $2, supplier_id = $3, base_material = $4, 
             embossing = $5, manufacturer = $6, image_url = $7, image_3d_url = $8, type = $9
         WHERE wallpaper_type_id = $10`,
        [
          article,
          description,
          supplier_id,
          base_material,
          embossing,
          manufacturer,
          image_url,
          image_3d_url,
          type,
          wallpaper_type_id,
        ]
      )

      res.status(200).json({ message: 'Товар и его тип успешно обновлены' })
    } catch (error) {
      console.error('Ошибка обновления товара и типа:', error)
      res.status(500).json({ message: 'Ошибка обновления товара и типа' })
    } finally {
      client.release()
    }
  }
)

/**
 * @swagger
 * /wallpaper-types/{wallpaper_id}/toggle-remaining:
 *   patch:
 *     summary: Изменение статуса Остаток товара
 *     tags: [Wallpapers]
 *     security:
 *       - adminAuth: []
 *       - managerAuth: []
 *     parameters:
 *       - in: path
 *         name: wallpaper_id
 *         required: true
 *         description: ID товара
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Статус Остаток товара успешно изменен
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Статус Остаток товара успешно изменен
 *                 is_remaining:
 *                   type: boolean
 *                   example: true
 *       404:
 *         description: Товар не найден
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Товар не найден
 *       500:
 *         description: Ошибка при изменении статуса Остаток товара
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Ошибка при изменении статуса Остаток товара
 */

router.patch(
  '/:wallpaper_id/toggle-remaining',
  authenticateAndAuthorize('admin', 'manager'),
  async (req, res) => {
    const { wallpaper_id } = req.params
    const client = await pool.connect()

    try {
      // Получаем текущие данные о наличии товара из базы данных
      const result = await client.query(
        'SELECT is_remaining FROM wallpapers WHERE wallpapers_id = $1',
        [wallpaper_id]
      )

      if (result.rowCount === 0) {
        return res.status(404).json({ message: 'Товар не найден' })
      }

      const { is_remaining } = result.rows[0]

      // Меняем значение на противоположное
      const newIsRemaining = !is_remaining

      // Обновляем значение в базе данных
      await client.query(
        'UPDATE wallpapers SET is_remaining = $1 WHERE wallpapers_id = $2',
        [newIsRemaining, wallpaper_id]
      )

      res.status(200).json({
        message: 'Статус Остаток товара успешно изменен',
        is_remaining: newIsRemaining,
      })
    } catch (error) {
      console.error('Ошибка при изменении статуса товара:', error)
      res
        .status(500)
        .json({ message: 'Ошибка при изменении статуса Остаток товара' })
    } finally {
      client.release()
    }
  }
)

/**
 * @swagger
 * /wallpaper-types/wallpaper-types-with-wallpapers:
 *   get:
 *     summary: Получение всех типов обоев с массивом связанных обоев
 *     tags: [Wallpapers]
 *     security:
 *       - adminAuth: []
 *       - managerAuth: []
 *     responses:
 *       200:
 *         description: Список типов обоев с их связанными обоями
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   wallpaper_types_id:
 *                     type: integer
 *                     description: ID типа обоев
 *                     example: 1
 *                   article:
 *                     type: string
 *                     description: Артикул типа обоев
 *                     example: A123
 *                   wallpapers:
 *                     type: array
 *                     description: Список обоев, связанных с данным типом
 *                     items:
 *                       type: object
 *                       properties:
 *                         wallpapers_id:
 *                           type: integer
 *                           description: ID обоев
 *                           example: 101
 *                         batch:
 *                           type: string
 *                           description: Партия обоев
 *                           example: Batch001
 *                         price:
 *                           type: number
 *                           description: Цена обоев
 *                           example: 500
 *                         quantity:
 *                           type: integer
 *                           description: Количество обоев
 *                           example: 10
 *       500:
 *         description: Ошибка получения записей
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Ошибка получения записей
 */

router.get('/wallpaper-types-with-wallpapers', async (req, res) => {
  const client = await pool.connect()

  try {
    // Получаем все типы обоев с их id и article
    const wallpaperTypesResult = await client.query(`
      SELECT wt.wallpaper_types_id, wt.article
      FROM wallpaper_types wt
      ORDER BY wt.created_at, wt.article
    `)

    const wallpaperTypesWithWallpapers = []

    // Для каждого типа обоев получаем связанные записи из таблицы wallpapers
    for (const type of wallpaperTypesResult.rows) {
      const wallpapersResult = await client.query(
        `
        SELECT w.wallpapers_id, w.batch, w.price, w.quantity
        FROM wallpapers w
        WHERE w.wallpaper_type_id = $1
        ORDER BY w.is_remaining, w.created_at
      `,
        [type.wallpaper_types_id]
      )

      // Формируем результат для текущего типа обоев
      wallpaperTypesWithWallpapers.push({
        wallpaper_types_id: type.wallpaper_types_id,
        article: type.article,
        wallpapers: wallpapersResult.rows.map((w) => ({
          wallpapers_id: w.wallpapers_id,
          batch: w.batch, // Поле batch сразу после wallpapers_id
          price: w.price,
          quantity: w.quantity,
        })),
      })
    }

    // Отправляем ответ
    res.status(200).json(wallpaperTypesWithWallpapers)
  } catch (error) {
    console.error('Ошибка при получении типов обоев:', error)
    res.status(500).json({ message: 'Ошибка сервера.' })
  } finally {
    client.release()
  }
})

module.exports = router
