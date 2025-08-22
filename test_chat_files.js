// Тестовый файл для проверки эндпоинтов chat-files
const axios = require('axios')

const API_BASE_URL = 'http://localhost:5000'

async function testChatFilesEndpoints() {
  try {
    console.log('🧪 Тестируем эндпоинты chat-files...')

    // Тест 1: Получение файлов для задачи 219
    console.log('\n1️⃣ Тестируем GET /api/chat-files/219')
    try {
      const response = await axios.get(`${API_BASE_URL}/api/chat-files/219`)
      console.log('✅ Успешно:', response.status, response.data)
    } catch (error) {
      console.log('❌ Ошибка:', error.response?.status, error.response?.data || error.message)
    }

    // Тест 2: Добавление тестового файла
    console.log('\n2️⃣ Тестируем POST /api/chat-files/add')
    try {
      const testFile = {
        message_id: 892,
        task_id: 219,
        original_name: 'test-image.jpg',
        server_filename: 'test-server-name.jpg',
        file_path: '/uploads/test-image.jpg',
        file_size: 1024,
        file_type: 'image/jpeg',
        is_image: true,
        sender_id: 7,
        sender_name: 'Тестовый пользователь',
      }

      const response = await axios.post(`${API_BASE_URL}/api/chat-files/add`, testFile)
      console.log('✅ Успешно добавлен файл:', response.status, response.data)
    } catch (error) {
      console.log(
        '❌ Ошибка при добавлении:',
        error.response?.status,
        error.response?.data || error.message
      )
    }

    // Тест 3: Повторное получение файлов
    console.log('\n3️⃣ Повторно тестируем GET /api/chat-files/219')
    try {
      const response = await axios.get(`${API_BASE_URL}/api/chat-files/219`)
      console.log('✅ Успешно:', response.status, response.data)
    } catch (error) {
      console.log('❌ Ошибка:', error.response?.status, error.response?.data || error.message)
    }
  } catch (error) {
    console.error('💥 Общая ошибка:', error.message)
  }
}

// Запускаем тест
testChatFilesEndpoints()
