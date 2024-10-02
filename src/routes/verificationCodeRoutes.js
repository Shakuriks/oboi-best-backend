const express = require('express')
const {
  generateVerificationCode,
  saveCodeToRedis,
  sendSms,
  verifyCode,
} = require('../services/verificationCodeService') // Путь к вашему сервису

const router = express.Router()

/**
 * @swagger
 * /verification/send-verification-code:
 *   post:
 *     summary: Отправить код проверки на номер телефона
 *     tags: [Verification]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/SendVerificationCodeRequest'
 *     responses:
 *       200:
 *         description: Код подтверждения отправлен.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SendVerificationCodeResponse'
 *       400:
 *         description: Номер телефона обязателен.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Номер телефона обязателен."
 *       500:
 *         description: Ошибка при отправке кода.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Ошибка при отправке кода. Попробуйте позже."
 */
router.post('/send-verification-code', async (req, res) => {
  const { phone_number } = req.body // Извлекаем номер телефона из тела запроса

  if (!phone_number) {
    return res.status(400).json({ message: 'Номер телефона обязателен.' })
  }

  try {
    const code = generateVerificationCode() // Генерируем код
    await saveCodeToRedis(phone_number, code) // Сохраняем код в Redis
    //await sendSms(phone_number, `Ваш код подтверждения: ${code}`) // Отправляем SMS с кодом

    res.status(200).json({ message: 'Код подтверждения отправлен.' })
  } catch (error) {
    console.error('Ошибка при отправке кода:', error)
    res.status(500).json({ message: 'Ошибка при отправке кода.' })
  }
})

/**
 * @swagger
 * /verification/verify-code:
 *   post:
 *     summary: Проверить код подтверждения
 *     tags: [Verification]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/VerifyCodeRequest'
 *     responses:
 *       200:
 *         description: Код подтвержден.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/VerifyCodeResponse'
 *       400:
 *         description: Неверный код.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Неверный код."
 *       500:
 *         description: Ошибка при проверке кода.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Ошибка при проверке кода. Попробуйте позже."
 */
router.post('/verify-code', async (req, res) => {
  const { phone_number, inputCode } = req.body // Извлекаем номер телефона и код из тела запроса

  if (!phone_number || !inputCode) {
    return res
      .status(400)
      .json({ message: 'Номер телефона и код обязательны.' })
  }

  try {
    const isValid = await verifyCode(phone_number, inputCode) // Проверяем код

    if (isValid) {
      res.status(200).json({ message: 'Код подтвержден.' })
    } else {
      res.status(400).json({ message: 'Неверный код.' })
    }
  } catch (error) {
    console.error('Ошибка при проверке кода:', error)
    res.status(500).json({ message: 'Ошибка при проверке кода.' })
  }
})

module.exports = router
