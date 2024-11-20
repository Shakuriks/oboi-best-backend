const { Client } = require('pg')
require('dotenv').config()

const client = new Client({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
})

async function runMigrations() {
  try {
    await client.connect()

    // Таблица suppliers
    await client.query(`
      CREATE TABLE IF NOT EXISTS suppliers (
        suppliers_id SERIAL PRIMARY KEY,
        name VARCHAR NOT NULL,
        email VARCHAR NOT NULL,
        description VARCHAR
      );
    `)

    // Таблица wallpaper_types
    await client.query(`
      CREATE TABLE IF NOT EXISTS wallpaper_types (
        wallpaper_types_id SERIAL PRIMARY KEY,
        article VARCHAR UNIQUE NOT NULL,
        description VARCHAR NOT NULL,
        supplier_id INT REFERENCES suppliers(suppliers_id),
        base_material VARCHAR NOT NULL,
        embossing VARCHAR NOT NULL,
        manufacturer VARCHAR NOT NULL,
        image_url VARCHAR,
        image_3d_url VARCHAR,
        type VARCHAR CHECK (type IN ('1.06', '0.53')) NOT NULL
      );
    `)

    // Таблица wallpapers
    await client.query(`
      CREATE TABLE IF NOT EXISTS wallpapers (
        wallpapers_id SERIAL PRIMARY KEY,
        batch VARCHAR NOT NULL,
        wallpaper_type_id INT REFERENCES wallpaper_types(wallpaper_types_id),
        shelf INT NOT NULL,
        row INT NOT NULL,
        quantity INT NOT NULL,
        price INT NOT NULL,
        cost_price INT NOT NULL,
        is_remaining BOOLEAN DEFAULT FALSE
      );
    `)

    // Таблица additional_products
    await client.query(`
      CREATE TABLE IF NOT EXISTS additional_products (
        additional_products_id SERIAL PRIMARY KEY,
        name VARCHAR NOT NULL,
        quantity INT NOT NULL,
        cost_price INT NOT NULL,
        price INT NOT NULL
      );
    `)

    // Таблица transactions
    await client.query(`
      CREATE TABLE IF NOT EXISTS transactions (
        transactions_id SERIAL PRIMARY KEY,
        type VARCHAR(50) CHECK (type IN ('purchase', 'return', 'defect', 'supply')) NOT NULL,
        discount INT DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `)

    // Таблица transaction_items
    await client.query(`
      CREATE TABLE IF NOT EXISTS transaction_items (
        transaction_items_id SERIAL PRIMARY KEY,
        transaction_id INT REFERENCES transactions(transactions_id),
        item_table VARCHAR(50) CHECK (item_table IN ('wallpapers', 'additional_products')),
        item_id INT,
        price INT NOT NULL,
        cost_price INT NOT NULL
      );
    `)

    // Таблица orders
    await client.query(`
      CREATE TABLE IF NOT EXISTS orders (
        orders_id SERIAL PRIMARY KEY,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        phone_number VARCHAR NOT NULL
      );
    `)

    // Таблица order_items
    await client.query(`
      CREATE TABLE IF NOT EXISTS order_items (
        order_items_id SERIAL PRIMARY KEY,
        order_id INT REFERENCES orders(orders_id),
        item_id INT REFERENCES wallpaper_types(wallpaper_types_id)
      );
    `)

    // Таблица users
    await client.query(`
        CREATE TABLE IF NOT EXISTS users (
          users_id SERIAL PRIMARY KEY,
          phone_number VARCHAR NOT NULL,
          password VARCHAR NOT NULL,
          name VARCHAR NOT NULL,
          role VARCHAR(50) CHECK (role IN ('user', 'manager', 'admin')) NOT NULL
        );
      `)

    // Таблица reservations
    await client.query(`
      CREATE TABLE IF NOT EXISTS reservations (
        reservations_id SERIAL PRIMARY KEY,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        user_id INT REFERENCES users(users_id),
        status VARCHAR(50) CHECK (status IN ('pending', 'processed', 'completed')) NOT NULL
      );
    `)

    // Таблица reservation_items
    await client.query(`
      CREATE TABLE IF NOT EXISTS reservation_items (
        reservation_items_id SERIAL PRIMARY KEY,
        reservation_id INT REFERENCES reservations(reservations_id),
        item_id INT REFERENCES wallpapers(wallpapers_id)
      );
    `)

    // Таблица refresh_tokens
    await client.query(`
      CREATE TABLE IF NOT EXISTS refresh_tokens (
        token_id SERIAL PRIMARY KEY,
        token TEXT NOT NULL,
        user_id INT REFERENCES users(users_id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `)

    // Добавление поля price_tag_printed в таблицу wallpaper_types, если его нет
    await client.query(`
    DO $$ 
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'wallpaper_types' AND column_name = 'price_tag_printed') THEN
        ALTER TABLE wallpaper_types ADD COLUMN price_tag_printed BOOLEAN DEFAULT false;
      END IF;
    END $$;
  `)

    // Добавление поля quantity в таблицу reservation_items, если его нет
    await client.query(`
    DO $$ 
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'reservation_items' AND column_name = 'quantity') THEN
        ALTER TABLE reservation_items ADD COLUMN quantity INT NOT NULL DEFAULT 1;
      END IF;
    END $$;
  `)

    // Добавление поля quantity в таблицу order_items, если его нет
    await client.query(`
    DO $$ 
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'order_items' AND column_name = 'quantity') THEN
        ALTER TABLE order_items ADD COLUMN quantity INT NOT NULL DEFAULT 1;
      END IF;
    END $$;
  `)

    // Добавление поля quantity в таблицу transaction_items, если его нет
    await client.query(`
    DO $$ 
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'transaction_items' AND column_name = 'quantity') THEN
        ALTER TABLE transaction_items ADD COLUMN quantity INT NOT NULL DEFAULT 1;
      END IF;
    END $$;
  `)

    await client.query(`
    DO $$ 
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'transaction_items' AND column_name = 'price' AND data_type = 'double precision') THEN
        ALTER TABLE transaction_items
        ALTER COLUMN price TYPE FLOAT USING price::FLOAT;
      END IF;
    END $$;
  `)

    // Проверка и добавление столбца created_at в таблицу wallpaper_types
    await client.query(`
    DO $$ 
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'wallpaper_types' AND column_name = 'created_at') THEN
        ALTER TABLE wallpaper_types
        ADD COLUMN created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL;
      END IF;
    END $$;
  `)

    await client.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'wallpapers' AND column_name = 'created_at') THEN
        ALTER TABLE wallpapers ADD COLUMN created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL;
      END IF;
    END
    $$;
  `)

    await client.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'additional_products' AND column_name = 'created_at') THEN
        ALTER TABLE additional_products ADD COLUMN created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL;
      END IF;
    END
    $$;
  `)

    console.log('Миграции выполнены успешно!')
  } catch (err) {
    console.error('Ошибка выполнения миграции:', err)
  } finally {
    await client.end()
  }
}

runMigrations()
