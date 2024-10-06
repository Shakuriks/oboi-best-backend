const { PDFDocument, rgb } = require('pdf-lib')
const fontkit = require('fontkit')
const fs = require('fs')
const convertNumberToWordsRu = require('number-to-words-ru').convert
const path = require('path')

const customFontPath = path.join(__dirname, 'fonts/arial.ttf')

async function generateInvoice(items, discount) {
  const pdfDoc = await PDFDocument.create()

  // Регистрация fontkit
  pdfDoc.registerFontkit(fontkit)

  // Встраиваем кастомный шрифт
  const customFontBytes = fs.readFileSync(customFontPath)
  const customFont = await pdfDoc.embedFont(customFontBytes)

  const page = pdfDoc.addPage([600, 400])
  const fontSize = 12

  // Заголовок документа
  page.drawText('Товарный чек', { x: 230, y: 350, size: 20, font: customFont })

  // Заголовки таблицы
  page.drawText('Наименование товара', {
    x: 52,
    y: 252,
    size: fontSize,
    font: customFont,
  })
  page.drawText('Кол-во', { x: 252, y: 252, size: fontSize, font: customFont })
  page.drawText('Цена', { x: 352, y: 252, size: fontSize, font: customFont })
  page.drawText('Сумма', { x: 452, y: 252, size: fontSize, font: customFont })

  // Горизонтальная линия под заголовком таблицы
  page.drawLine({
    start: { x: 50, y: 270 },
    end: { x: 550, y: 270 },
    thickness: 1,
    color: rgb(0, 0, 0),
  })

  let yPosition = 230

  // Рассчитываем скидку для товаров типа "wallpaper"
  const wallpaperItems = items.filter((item) => item.type === 'wallpaper')
  const totalWallpaperQuantity = wallpaperItems.reduce(
    (sum, item) => sum + item.quantity,
    0
  )
  const discountPerItem =
    totalWallpaperQuantity > 0
      ? (discount / totalWallpaperQuantity).toFixed(2)
      : 0

  // Переменная для хранения общей суммы
  let totalSum = 0

  // Отрисовка содержимого таблицы
  items.forEach((item) => {
    const priceAfterDiscount =
      item.type === 'wallpaper'
        ? (item.price - discountPerItem).toFixed(2)
        : item.price

    const total = (priceAfterDiscount * item.quantity).toFixed(2)
    totalSum += parseFloat(total)

    const itemName =
      item.type === 'wallpaper' ? `Обои ${item.article}` : item.name

    page.drawText(itemName, {
      x: 52,
      y: yPosition + 2,
      size: fontSize,
      font: customFont,
    })
    page.drawText(String(item.quantity), {
      x: 252,
      y: yPosition + 2,
      size: fontSize,
      font: customFont,
    })
    page.drawText(String(priceAfterDiscount), {
      x: 352,
      y: yPosition + 2,
      size: fontSize,
      font: customFont,
    })
    page.drawText(String(total), {
      x: 452,
      y: yPosition + 2,
      size: fontSize,
      font: customFont,
    })

    yPosition -= 20 // Переход на следующую строку
  })

  // Горизонтальные линии (включая под заголовком)
  for (let i = 0; i <= items.length + 1; i++) {
    const currentY = 250 - i * 20
    page.drawLine({
      start: { x: 50, y: currentY },
      end: { x: 550, y: currentY },
      thickness: 1,
      color: rgb(0, 0, 0),
    })
  }

  // Вертикальные линии таблицы
  page.drawLine({
    start: { x: 50, y: 270 },
    end: { x: 50, y: 230 - items.length * 20 },
    thickness: 1,
    color: rgb(0, 0, 0),
  })
  page.drawLine({
    start: { x: 250, y: 270 },
    end: { x: 250, y: 230 - items.length * 20 },
    thickness: 1,
    color: rgb(0, 0, 0),
  })
  page.drawLine({
    start: { x: 350, y: 270 },
    end: { x: 350, y: 230 - items.length * 20 },
    thickness: 1,
    color: rgb(0, 0, 0),
  })
  page.drawLine({
    start: { x: 450, y: 270 },
    end: { x: 450, y: 230 - items.length * 20 },
    thickness: 1,
    color: rgb(0, 0, 0),
  })
  page.drawLine({
    start: { x: 550, y: 270 },
    end: { x: 550, y: 230 - items.length * 20 },
    thickness: 1,
    color: rgb(0, 0, 0),
  })

  // Генерация текста для суммы словами
  totalWords = `Всего: ${totalSum.toFixed(2)} (${convertNumberToWordsRu(
    totalSum.toFixed(2)
  )})`

  page.drawText(totalWords, {
    x: 50,
    y: yPosition - 20,
    size: fontSize,
    font: customFont,
  })

  // Горизонтальная линия под заголовком таблицы
  page.drawLine({
    start: { x: 85, y: yPosition - 22 },
    end: { x: 550, y: yPosition - 22 },
    thickness: 1,
    color: rgb(0, 0, 0),
  })

  // Сохраняем PDF в файл
  const pdfBytes = await pdfDoc.save()
  //fs.writeFileSync('invoice.pdf', pdfBytes)
  return pdfBytes // Возвращаем PDF как байты
}

module.exports = { generateInvoice }
