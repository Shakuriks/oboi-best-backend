const jwt = require('jsonwebtoken')
const client = require('./dbService') // Путь к вашему сервису базы данных

// Генерация access токена
function generateAccessToken(user) {
  return jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1d' }) // 1 день
}

// Генерация refresh токена
function generateRefreshToken(user) {
  return jwt.sign(user, process.env.REFRESH_TOKEN_SECRET, { expiresIn: '6mo' }) // 6 месяцев
}

// Проверка валидности refresh токена в базе данных
async function verifyRefreshToken(token) {
  const result = await client.query(
    'SELECT * FROM refresh_tokens WHERE token = $1',
    [token]
  )
  return result.rowCount > 0 // Возвращает true, если токен существует в базе данных
}

// Удаление refresh токена из базы данных
async function removeRefreshToken(token) {
  await client.query('DELETE FROM refresh_tokens WHERE token = $1', [token])
}

// Сохранение нового refresh токена в базе данных
async function saveRefreshToken(token, userId) {
  await client.query(
    'INSERT INTO refresh_tokens (token, user_id) VALUES ($1, $2)',
    [token, userId]
  )
}

// Экспорт функций
module.exports = {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
  removeRefreshToken,
  saveRefreshToken,
}
