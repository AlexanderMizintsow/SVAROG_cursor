const express = require('express')
const { Pool, Client } = require('pg')
const http = require('http')
const { Server } = require('socket.io') // Используем класс Server из socket.io
require('dotenv').config()
const cors = require('cors')

const app = express()
const server = http.createServer(app)

// Настройка CORS для Socket.io
const io = new Server(server, {
  // Создаем новый экземпляр Server
  cors: {
    origin: [
      'http://localhost:5173', // Локальный адрес
      'http://192.168.57.112:5173', // Локальный IP-адрес
      'http://172.26.32.1:5173', // Альтернативный локальный IP-адрес
    ],
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type'],
    credentials: true,
  },
})

const port = process.env.PORT || 5004
app.use(cors())
app.use(express.json()) // Для обработки JSON в запросах

const dbPool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
})

// Создание клиента для уведомлений *************************
const notifyClient = new Client({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
})

notifyClient.connect()

// Подписка на канал
notifyClient.query('LISTEN new_call_channel')
notifyClient.query('LISTEN reminder_notifications')
// Обработка уведомлений
notifyClient.on('notification', (msg) => {
  io.emit('new_call', msg.payload) // Эмитируем событие для всех подключенных клиентов
})
// END **********************************************************
// Функция для передачи напоминаний через WebSocket
const fetchAndNotifyReminders = async () => {
  try {
    const now = new Date()
    const query = `
    SELECT * FROM reminders
    WHERE date_time <= $1 AND is_completed = FALSE
  `
    const results = await dbPool.query(query, [now])

    if (results.rows.length > 0) {
      // Отправляем все напоминания, соответствующие условиям
      io.emit('reminders', results.rows)
    }
  } catch (error) {
    console.error('Ошибка получения напоминаний:', error)
  } finally {
    setTimeout(fetchAndNotifyReminders, 10000)
  }
}
fetchAndNotifyReminders()
// Установка интервала проверки каждую минуту
//setInterval(fetchAndNotifyReminders, 10000) // Каждые 60 секунд
app.get('/api/reminders', async (req, res) => {
  const userId = req.query.userId // Получаем ID пользователя из параметров запроса

  if (!userId) {
    return res.status(400).json({ error: 'User ID is required' }) // Возвращаем ошибку, если userId не указан
  }

  try {
    const query = `
      SELECT * FROM reminders 
      WHERE user_id = $1 
      AND is_completed = FALSE 
      AND date_time <= NOW() -- Добавлено условие, чтобы получать только те напоминания, которые надо показывать
    `
    const results = await dbPool.query(query, [userId])

    res.json(results.rows) // Отправляем найденные напоминания в ответе
  } catch (error) {
    console.error('Ошибка получения напоминаний:', error)
    res.status(500).json({ error: 'Ошибка получения напоминаний' })
  }
})

// Список информации звонков
/*app.get('/api/calls', async (req, res) => {
  const { status, page = 1, limit = 50, userId } = req.query

  try {
    const offset = (page - 1) * limit

    // Подготовка основного условия WHERE
    let userCondition = ''
    const params = [status]

    if (userId) {
      userCondition = 'AND (users.id = $2 OR users2.id = $2)'
      params.push(userId)
    }

    // Запрос для данных
    const result = await dbPool.query(
      `SELECT 
        dealers.id AS dealer_id,
        calls.id AS call_id,
        calls.caller_number,
        calls.receiver_number,
        calls.accepted_at,
        calls.status,
        CASE 
            WHEN dealers.id IS NOT NULL THEN CONCAT(dealers.last_name, ' ', dealers.first_name, ' ', COALESCE(dealers.middle_name, ''))
            ELSE CONCAT(users.last_name, ' ', users.first_name, ' ', COALESCE(users.middle_name, ''))
        END AS caller_name,
        CASE 
            WHEN dealers2.id IS NOT NULL THEN CONCAT(dealers2.last_name, ' ', dealers2.first_name, ' ', COALESCE(dealers2.middle_name, ''))
            ELSE CONCAT(users2.last_name, ' ', users2.first_name, ' ', COALESCE(users2.middle_name, ''))
        END AS receiver_name
      FROM calls
      LEFT JOIN dealer_phone_numbers ON calls.caller_number = dealer_phone_numbers.phone_number
      LEFT JOIN dealers ON dealer_phone_numbers.dealer_id = dealers.id
      LEFT JOIN user_phones ON calls.caller_number = user_phones.phone_number
      LEFT JOIN users ON user_phones.user_id = users.id 
      LEFT JOIN dealer_phone_numbers AS dealer_phone_numbers2 ON calls.receiver_number = dealer_phone_numbers2.phone_number
      LEFT JOIN dealers AS dealers2 ON dealer_phone_numbers2.dealer_id = dealers2.id
      LEFT JOIN user_phones AS user_phones2 ON calls.receiver_number = user_phones2.phone_number
      LEFT JOIN users AS users2 ON user_phones2.user_id = users2.id
      WHERE calls.status = \$1  ${userCondition}
      ORDER BY calls.accepted_at DESC
      LIMIT $${userId ? 3 : 2} OFFSET $${userId ? 4 : 3};`,
      [...params, limit, offset]
    )

    // Запрос для общего количества
    const countResult = await dbPool.query(
      `SELECT COUNT(*) 
       FROM calls
       LEFT JOIN user_phones ON calls.caller_number = user_phones.phone_number
       LEFT JOIN users ON user_phones.user_id = users.id
       LEFT JOIN user_phones AS user_phones2 ON calls.receiver_number = user_phones2.phone_number
       LEFT JOIN users AS users2 ON user_phones2.user_id = users2.id
       WHERE calls.status = \$1 ${userCondition}`,
      params
    )

    res.json({
      data: result.rows,
      total: parseInt(countResult.rows[0].count, 10),
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})*/

// Список информации звонков
app.get('/api/calls', async (req, res) => {
  const { status, page = 1, limit = 50, userId, unassigned, receiverId } = req.query

  try {
    const offset = (page - 1) * limit
    let whereConditions = ['calls.status = $1']
    const params = [status]

    // Всегда включаем базовые JOIN для users, даже если userId не передан
    let joins = [
      'LEFT JOIN dealer_phone_numbers ON calls.caller_number = dealer_phone_numbers.phone_number',
      'LEFT JOIN dealers ON dealer_phone_numbers.dealer_id = dealers.id',
      'LEFT JOIN user_phones ON calls.caller_number = user_phones.phone_number',
      'LEFT JOIN users ON user_phones.user_id = users.id',
      'LEFT JOIN dealer_phone_numbers AS dealer_phone_numbers2 ON calls.receiver_number = dealer_phone_numbers2.phone_number',
      'LEFT JOIN dealers AS dealers2 ON dealer_phone_numbers2.dealer_id = dealers2.id',
      'LEFT JOIN user_phones AS user_phones2 ON calls.receiver_number = user_phones2.phone_number',
      'LEFT JOIN users AS users2 ON user_phones2.user_id = users2.id',
    ]

    // Фильтр по userId (если передан)
    if (userId) {
      whereConditions.push(
        `(users.id = $${params.length + 1} OR users2.id = $${params.length + 1})`
      )
      params.push(userId)
    }

    // Фильтр по незакрепленным звонкам
    if (unassigned) {
      whereConditions.push('(users.id IS NULL AND dealers.id IS NULL)')
    }

    // Фильтр по получателю
    if (receiverId === null) {
      whereConditions.push('(users2.id IS NULL AND dealers2.id IS NULL)')
    } else if (receiverId) {
      whereConditions.push(`(calls.receiver_number = $${params.length + 1})`)
      params.push(receiverId)
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : ''

    // Формируем полный запрос
    const query = `
      SELECT 
        dealers.id AS dealer_id,
        calls.id AS call_id,
        calls.caller_number,
        calls.receiver_number,
        calls.accepted_at,
        calls.status,
        CASE 
          WHEN dealers.id IS NOT NULL THEN CONCAT(dealers.last_name, ' ', dealers.first_name, ' ', COALESCE(dealers.middle_name, ''))
          ELSE CONCAT(users.last_name, ' ', users.first_name, ' ', COALESCE(users.middle_name, ''))
        END AS caller_name,
        CASE 
          WHEN dealers2.id IS NOT NULL THEN CONCAT(dealers2.last_name, ' ', dealers2.first_name, ' ', COALESCE(dealers2.middle_name, ''))
          ELSE CONCAT(users2.last_name, ' ', users2.first_name, ' ', COALESCE(users2.middle_name, ''))
        END AS receiver_name
      FROM calls
      ${joins.join('\n')}
      ${whereClause}
      ORDER BY calls.accepted_at DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `

    const result = await dbPool.query(query, [...params, limit, offset])

    const totalQuery = `SELECT COUNT(*) FROM calls ${joins.join('\n')} ${whereClause}`
    const total = await dbPool.query(totalQuery, params)

    res.json({
      data: result.rows,
      total: parseInt(total.rows[0].count, 10),
    })
  } catch (error) {
    console.error('Ошибка при получении звонков:', error)
    res.status(500).json({ error: 'Ошибка при получении звонков' })
  }
})

// Маршрут для добавления номера телефона
app.post('/api/add-phone', async (req, res) => {
  const { dealerId, phoneNumber, phoneType, isPrimary } = req.body

  if (!dealerId || !phoneNumber) {
    return res.status(400).json({ error: 'Необходимо указать ID дилера и номер телефона' })
  }

  try {
    const result = await dbPool.query(
      'INSERT INTO dealer_phone_numbers (dealer_id, phone_number, phone_type, is_primary) VALUES ($1, $2, $3, $4) RETURNING *',
      [dealerId, phoneNumber, phoneType, isPrimary]
    )

    res.status(201).json({
      message: 'Номер телефона успешно добавлен',
      phone: result.rows[0],
    })
  } catch (error) {
    console.error('Ошибка при добавлении номера:', error)
    res.status(500).json({ error: 'Ошибка сервера' })
  }
})

// Маршрут получить комментарии по call_id
app.get('/api/call-comments/:callId', async (req, res) => {
  const { callId } = req.params

  try {
    const result = await dbPool.query('SELECT * FROM call_comments WHERE call_id = $1', [callId])

    res.status(200).json(result.rows) // Возврат всех комментариев
  } catch (error) {
    console.error('Ошибка при извлечении комментариев:', error)
    res.status(500).send('Ошибка сервера')
  }
})

// Маршрут для добавления комментария
app.post('/api/call-comments', async (req, res) => {
  const { dealer_id, user_id, comment, call_id } = req.body // Добавили call_id

  try {
    const result = await dbPool.query(
      'INSERT INTO call_comments (dealer_id, user_id, comment, call_id) VALUES ($1, $2, $3, $4) RETURNING *',
      [dealer_id, user_id, comment, call_id] // Добавили call_id
    )
    res.status(201).send(result.rows[0]) // Отправляем созданный комментарий
  } catch (error) {
    console.error('Ошибка при добавлении комментария:', error)
    res.status(500).send('Ошибка сервера')
  }
})

// Маршрут для редактирования комментария
app.patch('/api/call-comments', async (req, res) => {
  const { call_id, comment } = req.body // Получаем данные из запроса

  try {
    const result = await dbPool.query(
      'UPDATE call_comments SET comment = $1 WHERE call_id = $2 RETURNING *',
      [comment, call_id] // Обновляем комментарий по call_id
    )

    if (result.rowCount === 0) {
      return res.status(404).send('Комментарий не найден') // Если комментарий не найден
    }

    res.status(200).send(result.rows[0]) // Отправляем обновленный комментарий
  } catch (error) {
    console.error('Ошибка при обновлении комментария:', error)
    res.status(500).send('Ошибка сервера') // Обработка ошибок сервера
  }
})

// Смена статуса звонка с пропущенного на отработанный
app.patch('/api/calls/batch-process', async (req, res) => {
  // 1. Валидация заголовков
  if (!req.is('application/json')) {
    return res.status(400).json({ message: 'Content-Type должен быть application/json' })
  }

  // 2. Валидация тела запроса
  const { callIds } = req.body
  if (!Array.isArray(callIds)) {
    return res.status(400).json({ message: 'callIds должен быть массивом' })
  }

  // 3. Проверка и преобразование типов
  const numericIds = callIds.map((id) => Number(id))
  if (numericIds.some(isNaN)) {
    return res.status(400).json({ message: 'Все ID должны быть числами' })
  }

  // 4. Проверка пустого массива
  if (numericIds.length === 0) {
    return res.status(400).json({ message: 'Массив callIds не может быть пустым' })
  }

  try {
    // 5. Выполнение запроса с явным приведением типа
    const result = await dbPool.query(
      `UPDATE calls 
       SET status = \$1 
       WHERE id = ANY(\$2::int[]) 
       AND status = \$3 
       RETURNING id, status`, // Явное указание возвращаемых полей
      ['processed', numericIds, 'missed']
    )

    // 6. Обработка результата
    if (result.rowCount === 0) {
      return res.status(404).json({
        message: 'Не найдено пропущенных звонков с указанными ID',
        attempted_ids: numericIds,
      })
    }

    res.status(200).json({
      updated_count: result.rowCount,
      sample_updated_ids: result.rows.slice(0, 5).map((r) => r.id),
    })
  } catch (error) {
    console.error('Database error:', error)
    res.status(500).json({
      message: 'Ошибка при массовом обновлении',
      error_details: process.env.NODE_ENV === 'development' ? error.message : undefined,
    })
  }
})

// Все пропущенные в статус обработанные
app.patch('/api/calls/batch-process', async (req, res) => {
  // Логирование входящего запроса
  console.log('Request headers:', req.headers)
  console.log('Request body:', req.body)

  // Проверка наличия тела запроса
  if (!req.body || typeof req.body !== 'object') {
    return res.status(400).json({ message: 'Необходимо передать JSON-объект' })
  }

  const { callIds } = req.body

  // Улучшенная валидация
  if (!Array.isArray(callIds)) {
    return res.status(400).json({ message: 'callIds должен быть массивом' })
  }

  if (callIds.some((id) => typeof id !== 'number')) {
    return res.status(400).json({ message: 'Все ID должны быть числами' })
  }

  if (callIds.length === 0) {
    return res.status(400).json({ message: 'Массив callIds не может быть пустым' })
  }

  try {
    const result = await dbPool.query(
      'UPDATE calls SET status = $1 WHERE id = ANY($2) AND status = $3 RETURNING *',
      ['processed', callIds, 'missed']
    )

    if (result.rowCount === 0) {
      return res.status(404).json({
        message: 'Звонки не найдены или статус не может быть изменен',
        details: `Попытка обновить callIds: ${callIds.join(', ')}`,
      })
    }

    res.status(200).json({
      message: `Статус успешно изменен для ${result.rowCount} звонков`,
      calls: result.rows,
    })
  } catch (error) {
    console.error('Ошибка базы данных:', error)
    res.status(500).json({
      message: 'Ошибка сервера',
      error: error.message,
    })
  }
})

// Получить сотрудника который закреплен за дилером
app.get('/api/dealer-employees', async (req, res) => {
  const { dealer_id } = req.query

  try {
    // Сначала получаем company_id для данного дилера
    const dealerQuery = `
      SELECT company_id
      FROM dealers
      WHERE id = $1
    `

    const { rows: dealerRows } = await dbPool.query(dealerQuery, [dealer_id])

    if (dealerRows.length === 0) {
      return res.status(404).json({ message: 'Дилер не найден' })
    }

    const companyId = dealerRows[0].company_id

    // Затем получаем всех сотрудников, связанных с этой компанией
    const employeesQuery = `
      SELECT 
        u.id AS employee_id,
        u.first_name,
        u.middle_name,
        u.last_name
      FROM users u
      WHERE u.id IN (
        SELECT regional_manager_id FROM companies WHERE id = $1
        UNION
        SELECT mpp_id FROM companies WHERE id = $1
        UNION
        SELECT mpr_id FROM companies WHERE id = $1
      )
    `

    const { rows: employeesRows } = await dbPool.query(employeesQuery, [companyId])

    if (employeesRows.length === 0) {
      return res.status(404).json({ message: 'Сотрудники не найдены' })
    }

    res.json(employeesRows) // Возвращаем массив сотрудников
  } catch (error) {
    console.error('Ошибка при получении сотрудников:', error)
    res.status(500).json({ message: 'Ошибка сервера' })
  }
})

// Записать лог кто отработал пропущенный звонок
app.post('/api/call-processing-logs', async (req, res) => {
  const { call_id, user_id } = req.body

  try {
    const result = await dbPool.query(
      'INSERT INTO call_processing_logs (call_id, user_id) VALUES ($1, $2) RETURNING *',
      [call_id, user_id]
    )
    res.status(201).send(result.rows[0]) // Отправляем созданную запись
  } catch (error) {
    console.error('Ошибка при добавлении записи в call_processing_logs:', error)
    res.status(500).send('Ошибка сервера')
  }
})

// Информация о пользователях, обработавших звонок.
app.get('/api/call-processor/:callId', async (req, res) => {
  const { callId } = req.params

  try {
    const result = await dbPool.query(
      `
      SELECT u.first_name, 
      u.middle_name, 
      u.last_name, 
      cpl.created_at
      FROM call_processing_logs cpl
      JOIN users u ON cpl.user_id = u.id
      WHERE cpl.call_id = $1
    `,
      [callId]
    )

    if (result.rows.length === 0) {
      // return res.status(404).send('Обработчик звонка не найден')
    }

    const processor = result.rows[0] // Берем первую запись, если есть
    res.status(200).send(processor) // Отправляем данные обработчика
  } catch (error) {
    console.error('Ошибка при извлечении данных обработчика звонка:', error)
    res.status(500).send('Ошибка сервера')
  }
})

// Эндпоинт для проверки и создания пользователя в таблице calls_settings_users при первом запуске ПО
app.post('/api/check-create-user', async (req, res) => {
  const { userId } = req.body

  try {
    // Проверка существования пользователя
    const result = await dbPool.query('SELECT id FROM calls_settings_users WHERE user_id = $1', [
      userId,
    ])
    console.error(userId)
    // Если пользователя нет, создаём новую запись с настройками по умолчанию
    if (result.rowCount === 0) {
      await dbPool.query(
        'INSERT INTO calls_settings_users (user_id, showMissedCallsEmployee, showAcceptedCallsEmployee) VALUES ($1, $2, $3)',
        [userId, true, true] // Установите значения по умолчанию
      )
      return res.status(201).json({ message: 'Пользователь создан с настройками по умолчанию' })
    }

    return res.status(200).json({ message: 'Пользователь уже существует' })
  } catch (error) {
    console.error('Ошибка при проверке или создании пользователя:', error)
    return res.status(500).json({ error: 'Ошибка сервера' })
  }
})

// Получение настройки ПРОПУЩЕННЫЕ ЗВОНКИ
app.get('/api/calls-settings-missed/:userId', async (req, res) => {
  const { userId } = req.params

  try {
    const result = await dbPool.query(
      'SELECT showMissedCallsEmployee FROM calls_settings_users WHERE user_id = $1',
      [userId]
    )
    if (result.rows.length > 0) {
      const showMissedCallsEmployee = result.rows[0].showmissedcallsemployee // Доступ к полю с правильным именем

      return res.status(200).json({
        showMissedCallsEmployee: showMissedCallsEmployee, // Возвращаем конкретное значение
      })
    }

    return res.status(200).json({
      showMissedCallsEmployee: true,
    })
  } catch (error) {
    console.error('Ошибка получения настроек:', error)
    return res.status(500).json({ error: 'Ошибка сервера' })
  }
})

// Получение настройки ПРИНЯТЫЕ ЗВОНКИ
app.get('/api/calls-settings-accepted/:userId', async (req, res) => {
  const { userId } = req.params

  try {
    const result = await dbPool.query(
      'SELECT showAcceptedCallsEmployee FROM calls_settings_users WHERE user_id = $1',
      [userId]
    )

    if (result.rows.length > 0) {
      const showAcceptedCallsEmployee = result.rows[0].showacceptedcallsemployee

      return res.status(200).json({
        showAcceptedCallsEmployee: showAcceptedCallsEmployee,
      })
    }

    return res.status(200).json({
      showAcceptedCallsEmployee: true,
    })
  } catch (error) {
    console.error('Ошибка получения настроек:', error)
    return res.status(500).json({ error: 'Ошибка сервера' })
  }
})

// Получение настройки НАПОМИНАНИЕ о ЗВОНКАХ
app.get('/api/calls-settings-reminders/:userId', async (req, res) => {
  const { userId } = req.params

  try {
    const result = await dbPool.query(
      'SELECT showRemindersCalls FROM calls_settings_users WHERE user_id = $1',
      [userId]
    )

    if (result.rows.length > 0) {
      const showRemindersCalls = result.rows[0].showreminderscalls

      return res.status(200).json({
        showRemindersCalls: showRemindersCalls,
      })
    }

    return res.status(200).json({
      showRemindersCalls: true,
    })
  } catch (error) {
    console.error('Ошибка получения настроек:', error)
    return res.status(500).json({ error: 'Ошибка сервера' })
  }
})

// Получение настройки УВЕДОМЛЕНИЯ В ЧАТ
app.get('/api/calls-settings-tg/:userId', async (req, res) => {
  const { userId } = req.params

  try {
    const result = await dbPool.query(
      'SELECT showCallMissedTg FROM calls_settings_users WHERE user_id = $1',
      [userId]
    )

    if (result.rows.length > 0) {
      const showCallMissedTg = result.rows[0].showcallmissedtg // Доступ к полю с правильным именем

      return res.status(200).json({
        showCallMissedTg: showCallMissedTg, // Возвращаем конкретное значение
      })
    }

    return res.status(200).json({
      showCallMissedTg: false, // Если настройки не найдены, возвращаем значение по умолчанию
    })
  } catch (error) {
    console.error('Ошибка получения настроек:', error)
    return res.status(500).json({ error: 'Ошибка сервера' })
  }
})

// Сохранения настроек для ПРИНЯТЫЕ ЗВОНКИ и ПРОПУЩЕННЫЕ ЗВОНКИ
app.put('/api/calls-settings/:userId', async (req, res) => {
  const { userId } = req.params
  const {
    showMissedCallsEmployee,
    showAcceptedCallsEmployee,
    showCallMissedTg,
    showRemindersCalls,
  } = req.body // Добавлено новое поле

  try {
    await dbPool.query(
      `UPDATE calls_settings_users 
       SET showMissedCallsEmployee = $1, showAcceptedCallsEmployee = $2, showCallMissedTg = $3,
       showRemindersCalls = $4
       WHERE user_id = $5`,
      [
        showMissedCallsEmployee,
        showAcceptedCallsEmployee,
        showCallMissedTg,
        showRemindersCalls,
        userId,
      ] // Обновляем новое поле
    )

    return res.status(200).json({ message: 'Настройки успешно обновлены' })
  } catch (error) {
    console.error('Ошибка обновления настроек:', error)
    return res.status(500).json({ error: 'Ошибка сервера' })
  }
})

// Обработчик маршрута для создания напоминания для ЗВОНКОВ
app.post('/api/reminders', async (req, res) => {
  const {
    related_id,
    user_id,
    date_time,
    comment,
    type_reminders,
    priority_notifications, // Если передается при запросе
    title, // Если передается при запросе
    tags, // Добавлено поле для тегов
    links, // Добавлено поле для ссылок
  } = req.body

  // Проверяем обязательные поля
  if (!related_id || !user_id || !date_time || !type_reminders) {
    return res.status(400).json({ error: 'Все поля обязательны для заполнения' })
  }

  // Убедитесь, что tags и links имеют значение по умолчанию
  const tagsValue = tags ? JSON.stringify(tags) : JSON.stringify([]) // Преобразуем в строку JSON
  const linksValue = links ? JSON.stringify(links) : JSON.stringify([]) // Преобразуем в строку JSON

  try {
    const query = `
          INSERT INTO reminders (related_id, user_id, date_time, comment, type_reminders, priority_notifications, title, tags, links)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *;
      `
    const values = [
      related_id,
      user_id,
      date_time,
      comment,
      type_reminders,
      priority_notifications || 'low', // Устанавливаем приоритет по умолчанию
      title || 'Напоминание', // Устанавливаем заголовок по умолчанию
      tagsValue,
      linksValue,
    ]

    const result = await dbPool.query(query, values)

    res.status(201).json(result.rows[0])
  } catch (error) {
    console.error('Ошибка при добавлении напоминания:', error.message)
    res.status(500).json({ error: 'Ошибка при добавлении напоминания' })
  }
})

app.patch('/api/reminders/complete', async (req, res) => {
  const { id, is_completed, completed_at } = req.body

  try {
    const result = await dbPool.query(
      `
      UPDATE reminders 
      SET is_completed = $1, completed_at = $2 
      WHERE id = $3 
      RETURNING *`,
      [is_completed, completed_at, id]
    )

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Напоминание не найдено' })
    }

    res.status(200).json(result.rows[0])
  } catch (error) {
    console.error('Ошибка при обновлении напоминания:', error)
    res.status(500).json({ error: 'Ошибка при обновлении напоминания' })
  }
})

// Обновление настройки УВЕДОМЛЕНИЯ о ПРОСРОЧЕННЫХ УВЕДОМЛЕНИЯХ
app.post('/api/settings-overdue-notification-update/:userId', async (req, res) => {
  const { userId } = req.params
  const { showOverdueNotification } = req.body // Получаем значение из тела запроса

  try {
    // Обновляем значение в базе данных
    await dbPool.query(
      'UPDATE calls_settings_users SET showOverdueNotification = $1 WHERE user_id = $2',
      [showOverdueNotification, userId]
    )

    return res.status(200).json({ message: 'Настройка успешно обновлена' })
  } catch (error) {
    console.error('Ошибка обновления настроек:', error)
    return res.status(500).json({ error: 'Ошибка сервера' })
  }
})

// Обновление настройки УВЕДОМЛЕНИЯ о ПРОСРОЧЕННЫХ УВЕДОМЛЕНИЯХ для показа руководителю отдела
app.post('/api/settings-overdue-implementer-notification-update/:userId', async (req, res) => {
  const { userId } = req.params
  const { showOverdueImplementer } = req.body // Получаем значение из тела запроса

  try {
    // Обновляем значение в базе данных
    await dbPool.query(
      'UPDATE calls_settings_users SET showOverdueImplementer = $1 WHERE user_id = $2',
      [showOverdueImplementer, userId]
    )

    return res.status(200).json({ message: 'Настройка успешно обновлена' })
  } catch (error) {
    console.error('Ошибка обновления настроек:', error)
    return res.status(500).json({ error: 'Ошибка сервера' })
  }
})

// Получение настройки УВЕДОМЛЕНИЯ о ПРОСРОЧЕННЫХ УВЕДОМЛЕНИЯХ
app.get('/api/settings-overdue-notification/:userId', async (req, res) => {
  const { userId } = req.params

  try {
    // Запрашиваем настройки из базы данных
    const result = await dbPool.query(
      'SELECT showOverdueNotification, showOverdueImplementer FROM calls_settings_users WHERE user_id = $1',
      [userId]
    )

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Настройки не найдены' })
    }
    console.log(result.rows[0])
    // Возвращаем необходимые данные
    return res.status(200).json(result.rows[0])
  } catch (error) {
    console.error('Ошибка получения настроек:', error)
    return res.status(500).json({ error: 'Ошибка сервера' })
  }
})

// ************************************************************
app.get('/api/reclamation-ratings-stats', async (req, res) => {
  try {
    // Получаем общую статистику по рекламациям
    const overviewQuery = `
      SELECT 
        COUNT(*) as total_ratings,
        AVG(rating) as average_rating,
        NOW() as last_updated
      FROM reclamation_ratings
      WHERE rated_at >= NOW() - INTERVAL '30 days'
    `

    // Получаем распределение оценок
    const ratingsQuery = `
      SELECT rating 
      FROM reclamation_ratings
      WHERE rated_at >= NOW() - INTERVAL '30 days'
    `

    // Получаем статистику по дилерам с информацией о компании
    const dealersQuery = `
      SELECT 
        r.user_id,
        r.user_name,
        COUNT(*) as total_ratings,
        AVG(r.rating) as average_rating,
        COALESCE(c.name_companies, 'Не указана') as company_name
      FROM reclamation_ratings r
      LEFT JOIN user_company_tg_bot uctb ON r.user_id = uctb.chat_id
      LEFT JOIN companies c ON uctb.company_id = c.id
      WHERE r.rated_at >= NOW() - INTERVAL '30 days'
      GROUP BY r.user_id, r.user_name, c.name_companies
      HAVING COUNT(*) >= 3
      ORDER BY AVG(r.rating) DESC
      LIMIT 10
    `

    const [overviewResult, ratingsResult, dealersResult] = await Promise.all([
      dbPool.query(overviewQuery),
      dbPool.query(ratingsQuery),
      dbPool.query(dealersQuery),
    ])

    // Получаем ID топовых дилеров для запроса их комментариев
    const topDealerIds = dealersResult.rows.map((dealer) => dealer.user_id)

    // Запрос для получения комментариев топовых дилеров
    let commentsResult
    if (topDealerIds.length > 0) {
      commentsResult = await dbPool.query(
        `
        SELECT 
          user_id,
          user_name,
          rating,
          comment,
          rated_at,
          request_number
        FROM reclamation_ratings
        WHERE user_id = ANY(\$1) AND rated_at >= NOW() - INTERVAL '30 days'
        ORDER BY user_id, rated_at DESC
      `,
        [topDealerIds]
      )
    } else {
      commentsResult = { rows: [] } // Пустой результат если нет дилеров
    }

    // Группируем комментарии по user_id
    const commentsByDealer = {}
    commentsResult.rows.forEach((row) => {
      if (!commentsByDealer[row.user_id]) {
        commentsByDealer[row.user_id] = []
      }
      commentsByDealer[row.user_id].push({
        rating: row.rating,
        comment: row.comment,
        date: row.rated_at,
        requestNumber: row.request_number,
      })
    })

    const responseData = {
      overview: {
        totalRatings: overviewResult.rows[0]?.total_ratings || 0,
        averageRating: parseFloat(overviewResult.rows[0]?.average_rating) || 0,
        period: '30 дней',
        lastUpdated: overviewResult.rows[0]?.last_updated,
      },
      ratings: ratingsResult.rows.map((row) => row.rating),
      dealers: dealersResult.rows.map((row) => ({
        user_id: row.user_id,
        user_name: `${row.user_name} (${row.company_name})`,
        company_name: row.company_name,
        totalRatings: row.total_ratings,
        averageRating: parseFloat(row.average_rating),
        period: '30 дней',
        comments: commentsByDealer[row.user_id] || [],
      })),
    }

    res.json(responseData)
  } catch (error) {
    console.error('Error fetching reclamation ratings stats:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// Запуск сервера
server.listen(port, '0.0.0.0', () => {
  console.log(`Server running on port ${port}`)
})
