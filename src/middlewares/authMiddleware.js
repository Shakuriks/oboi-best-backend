const jwt = require('jsonwebtoken')

function authenticateAndAuthorize(...roles) {
  return (req, res, next) => {
    const authHeader = req.headers['authorization']
    const token = authHeader && authHeader.split(' ')[1]

    if (!token) return res.sendStatus(401) // Нет токена

    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, user) => {
      if (err) return res.sendStatus(403) // Ошибка проверки токена

      req.user = user // Извлекаем информацию о пользователе, включая роль

      // Проверяем роль
      if (roles.length && !roles.includes(user.role)) {
        return res.sendStatus(403) // Запрещено
      }

      next() // Переход к следующему middleware или контроллеру
    })
  }
}

module.exports = { authenticateAndAuthorize }
