const bcrypt = require('bcrypt')
const { Client } = require('pg')
require('dotenv').config()

const client = new Client({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
})

async function runSeeds() {
  try {
    client.connect()
    // Сид для таблицы suppliers
    await client.query(`
      INSERT INTO suppliers (name, email, description) VALUES
      ('Supplier 1', 'supplier1@example.com', 'Description for Supplier 1'),
      ('Supplier 2', 'supplier2@example.com', 'Description for Supplier 2'),
      ('Supplier 3', 'supplier3@example.com', 'Description for Supplier 3')
      ON CONFLICT DO NOTHING;
    `)

    // Сид для таблицы wallpaper_types
    await client.query(`
      INSERT INTO wallpaper_types (article, description, supplier_id, base_material, embossing, manufacturer, image_url, image_3d_url, type) VALUES
      ('Article 1', 'Description for Article 1', 1, 'Material A', 'Embossing 1', 'Manufacturer 1', 'url1', '3durl1', '1.06'),
      ('Article 2', 'Description for Article 2', 1, 'Material B', 'Embossing 2', 'Manufacturer 2', 'url2', '3durl2', '0.53'),
      ('Article 3', 'Description for Article 3', 2, 'Material C', 'Embossing 3', 'Manufacturer 3', 'url3', '3durl3', '1.06'),
      ('Article 4', 'Description for Article 4', 3, 'Material D', 'Embossing 4', 'Manufacturer 1', 'url4', '3durl4', '0.53')
      ON CONFLICT DO NOTHING;
    `)

    // Сид для таблицы wallpapers
    await client.query(`
      INSERT INTO wallpapers (batch, wallpaper_type_id, shelf, row, quantity, price, cost_price, is_remaining) VALUES
      ('Batch 1', 1, 1, 1, 100, 2000, 1500, FALSE),
      ('Batch 2', 1, 1, 2, 150, 2200, 1600, TRUE),
      ('Batch 3', 1, 2, 1, 200, 3000, 2500, FALSE),
      ('Batch 4', 2, 1, 1, 120, 2800, 2100, TRUE),
      ('Batch 5', 2, 1, 2, 130, 3500, 3000, FALSE),
      ('Batch 6', 3, 1, 1, 80, 1500, 1200, TRUE),
      ('Batch 7', 3, 2, 1, 60, 2000, 1700, FALSE),
      ('Batch 8', 4, 2, 1, 90, 1800, 1400, TRUE)
      ON CONFLICT DO NOTHING;
    `)

    // Сид для таблицы additional_products
    await client.query(`
      INSERT INTO additional_products (name, quantity, cost_price, price) VALUES
      ('Additional Product 1', 50, 1000, 1200),
      ('Additional Product 2', 30, 800, 1000),
      ('Additional Product 3', 20, 1500, 1700)
      ON CONFLICT DO NOTHING;
    `)

    // Сид для таблицы users
    const hashedPassword1 = await bcrypt.hash('password1', 10)
    const hashedPassword2 = await bcrypt.hash('password2', 10)
    const hashedPassword3 = await bcrypt.hash('password3', 10)
    const hashedPassword4 = await bcrypt.hash('password4', 10)

    await client.query(`
      INSERT INTO users (phone_number, password, name, role) VALUES
      ('+12345678901', '${hashedPassword1}', 'User 1', 'user'),
      ('+12345678902', '${hashedPassword2}', 'User 2', 'manager'),
      ('+12345678903', '${hashedPassword3}', 'User 3', 'admin'),
      ('+12345678904', '${hashedPassword4}', 'User 4', 'user')
      ON CONFLICT DO NOTHING;
    `)

    // Сид для таблицы transactions
    await client.query(`
      INSERT INTO transactions (type, discount, created_at) VALUES
      ('purchase', 0, DEFAULT),
      ('return', 5, DEFAULT),
      ('supply', 0, DEFAULT),
      ('defect', 10, DEFAULT)
      ON CONFLICT DO NOTHING;
    `)

    // Сид для таблицы transaction_items
    await client.query(`
      INSERT INTO transaction_items (transaction_id, item_table, item_id, price, cost_price) VALUES
      (1, 'wallpapers', 1, 2000, 1500),
      (1, 'additional_products', 1, 1200, 1000),
      (2, 'wallpapers', 2, 2200, 1600),
      (3, 'additional_products', 3, 1700, 1500),
      (4, 'wallpapers', 3, 3000, 2500)
      ON CONFLICT DO NOTHING;
    `)

    // Сид для таблицы orders
    await client.query(`
      INSERT INTO orders (created_at, phone_number) VALUES
      (DEFAULT, '+12345678901'),
      (DEFAULT, '+12345678902'),
      (DEFAULT, '+12345678903')
      ON CONFLICT DO NOTHING;
    `)

    // Сид для таблицы order_items
    await client.query(`
      INSERT INTO order_items (order_id, item_id) VALUES
      (1, 1),
      (1, 2),
      (2, 3),
      (3, 1)
      ON CONFLICT DO NOTHING;
    `)

    // Сид для таблицы reservations
    await client.query(`
      INSERT INTO reservations (created_at, user_id, status) VALUES
      (DEFAULT, 1, 'pending'),
      (DEFAULT, 2, 'processed'),
      (DEFAULT, 3, 'completed')
      ON CONFLICT DO NOTHING;
    `)

    // Сид для таблицы reservation_items
    await client.query(`
      INSERT INTO reservation_items (reservation_id, item_id) VALUES
      (1, 1),
      (1, 2),
      (2, 3),
      (3, 1)
      ON CONFLICT DO NOTHING;
    `)

    console.log('Сиды выполнены успешно!')
  } catch (err) {
    console.error('Ошибка выполнения сидов:', err)
  } finally {
    await client.end()
  }
}

runSeeds()
