// Если таблица accepted_calls  содержит null то считать пропущенным звонком

require('dotenv').config()
const net = require('net')
const { Pool } = require('pg')
const path = require('path')

const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'Svarog',
  password: 'postgres',
  port: 5432,
})

const amiHost = '192.168.57.165' // IP-адрес Asterisk сервера
const amiPort = 5038
const amiUser = 'ats'
const amiPassword = 'S2s14q98svf32a'

// Создание клиента для подключения к Asterisk AMI
const client = new net.Socket()
let currentCall = {}

// Определение пути к рабочему столу
const desktopPath = path.join(process.env.HOME || process.env.USERPROFILE, 'Desktop')

client.connect(amiPort, amiHost, () => {
  console.log('Connected to Asterisk AMI')
  client.write(`Action: Login\r\nUsername: ${amiUser}\r\nSecret: ${amiPassword}\r\n\r\n`)
})

client.on('data', async (data) => {
  const response = data.toString().split('\r\n')

  for (const line of response) {
    if (line.startsWith('Event: Newchannel')) {
      // Начало нового звонка
      currentCall.channel = line.split(': ')[1]
      console.log(`New call detected on channel: ${currentCall.channel}`)
    } else if (line.startsWith('CallerIDNum:')) {
      // Caller ID номера
      currentCall.callerNumber = line.split(': ')[1]
      console.log(`Caller ID Number: ${currentCall.callerNumber}`)
    } else if (line.startsWith('Exten:')) {
      // Номер, на который звонят
      currentCall.receiverNumber = line.split(': ')[1]
      console.log(`Receiver Number: ${currentCall.receiverNumber}`)
    } else if (line.startsWith('Event: Dial')) {
      // Событие Dial для получения номера получателя
      currentCall.receiverNumber = line.split('Exten: ')[1]
      console.log(`Receiver Number from Dial event: ${currentCall.receiverNumber}`)
    } else if (line.startsWith('Event: Hangup')) {
      // Конец звонка
      currentCall.timestamp = new Date().toISOString()

      // Определяем статус звонка
      const status = currentCall.receiverNumber ? 'accepted' : 'missed'

      try {
        // Проверяем, что номера не undefined
        if (!currentCall.callerNumber) {
          console.error('Error: Caller number is undefined.')
          continue // Пропускаем запись в базу данных, если данные неполные
        }

        // Вставляем запись в базу данных
        const result = await pool.query(
          'INSERT INTO calls (caller_number, receiver_number, accepted_at, status) VALUES ($1, $2, $3, $4) RETURNING id',
          [currentCall.callerNumber, currentCall.receiverNumber, currentCall.timestamp, status]
        )
        // Отправляем уведомление о новом звонке
        const newCallId = result.rows[0].id // Получаем ID новой записи
        //  await pool.query('NOTIFY new_call_channel, $1', [newCallId.toString()])
        await pool.query(`NOTIFY new_call_channel, '${newCallId.toString()}'`)

        // await pool.query(`NOTIFY new_call_channel, '${newCallId.toString()}'`); // "Этот вариант верный но нужна проверка"

        // Вывод информации о звонке
        console.log(
          `Call logged: Caller Number: ${currentCall.callerNumber}, Receiver Number: ${currentCall.receiverNumber}, Status: ${status}`
        )
        console.log('Call recording saved in database.')
      } catch (err) {
        console.error('Database error: ' + err.message)
      } finally {
        // Очищаем текущие данные о звонке
        currentCall = {}
      }
    }
  }
})

client.on('error', (err) => {
  console.error('Error: ' + err.message)
})

client.on('end', () => {
  console.log('Connection ended.')
})

client.on('close', () => {
  console.log('Connection closed. Reconnecting...')
  setTimeout(() => client.connect(amiPort, amiHost), 5000)
})

/*require('dotenv').config()
const net = require('net')
const { Pool } = require('pg')
const path = require('path')

const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'Svarog',
  password: 'postgres',
  port: 5432,
})

const amiHost = '192.168.57.165' // IP-адрес вашего Asterisk сервера
const amiPort = 5038
const amiUser = 'ats'
const amiPassword = 'S2s14q98svf32a'

// Создание клиента для подключения к Asterisk AMI
const client = new net.Socket()
let currentCall = {}

// Определение пути к рабочему столу
const desktopPath = path.join(
  process.env.HOME || process.env.USERPROFILE,
  'Desktop'
)

client.connect(amiPort, amiHost, () => {
  console.log('Connected to Asterisk AMI')
  client.write(
    `Action: Login\r\nUsername: ${amiUser}\r\nSecret: ${amiPassword}\r\n\r\n`
  )
})

client.on('data', async (data) => {
  const response = data.toString().split('\r\n')

  for (const line of response) {
    if (line.startsWith('Event: Newchannel')) {
      // Начало нового звонка
      currentCall.channel = line.split(': ')[1]
      console.log(`New call detected on channel: ${currentCall.channel}`)
    } else if (line.startsWith('CallerIDNum:')) {
      // Caller ID номера
      currentCall.callerNumber = line.split(': ')[1]
      console.log(`Caller ID Number: ${currentCall.callerNumber}`)
    } else if (line.startsWith('Exten:')) {
      // Номер, на который звонят
      currentCall.receiverNumber = line.split(': ')[1]
      console.log(`Receiver Number: ${currentCall.receiverNumber}`)
    } else if (line.startsWith('Event: Dial')) {
      // Событие Dial для получения номера получателя
      currentCall.receiverNumber = line.split('Exten: ')[1]
      console.log(
        `Receiver Number from Dial event: ${currentCall.receiverNumber}`
      )
    } else if (line.startsWith('Event: Hangup')) {
      // Конец звонка
      currentCall.timestamp = new Date().toISOString()

      // Определяем статус звонка
      const status = currentCall.receiverNumber ? 'accepted' : 'missed'

      try {
        // Проверяем, что номера не undefined
        if (!currentCall.callerNumber) {
          console.error('Error: Caller number is undefined.')
          continue // Пропускаем запись в базу данных, если данные неполные
        }

        // Проверяем, существует ли запись с missed статусом для этого caller_number
        const existingCall = await pool.query(
          'SELECT * FROM calls WHERE caller_number = $1 AND status = $2',
          [currentCall.callerNumber, 'missed']
        )

        if (existingCall.rows.length > 0) {
          // Обновляем статус существующей записи на processed
          await pool.query(
            'UPDATE calls SET status = $1 WHERE id = $2',
            ['processed', existingCall.rows[0].id]
          )
          console.log(
            `Call updated: Caller Number: ${currentCall.callerNumber}, Status: processed`
          )
        } else {
          // Вставляем новую запись в базу данных
          await pool.query(
            'INSERT INTO calls (caller_number, receiver_number, accepted_at, status) VALUES ($1, $2, $3, $4)',
            [
              currentCall.callerNumber,
              currentCall.receiverNumber,
              currentCall.timestamp,
              status,
            ]
          )
          console.log(
            `Call logged: Caller Number: ${currentCall.callerNumber}, Receiver Number: ${currentCall.receiverNumber}, Status: ${status}`
          )
        }

        console.log('Call recording saved in database.')
      } catch (err) {
        console.error('Database error: ' + err.message)
      } finally {
        // Очищаем текущие данные о звонке
        currentCall = {}
      }
    }
  }
})

client.on('error', (err) => {
  console.error('Error: ' + err.message)
})

client.on('end', () => {
  console.log('Connection ended.')
})

client.on('close', () => {
  console.log('Connection closed.')
})
*/
