import { useState, useEffect, useCallback, useRef } from 'react'
import axios from 'axios'
import EmojiPicker from 'emoji-picker-react'
import { API_BASE_URL } from '../../../../../../config'
import useWebSocket from '../../../Boards/subcomponents/useWebSocket'
import useUserStore from '../../../../../store/userStore'
import './chatTaskModal.scss'

const ChatTaskModal = ({
  task,
  onClose,
  isOpen,
  currentUser,
  transformStyle = 'translate(-50%, -50%)',
}) => {
  const { user } = useUserStore()
  const messagesContainerRef = useRef(null)
  const [messages, setMessages] = useState([])
  const [newMessage, setNewMessage] = useState('')
  const [participants, setParticipants] = useState([])
  const [isClosing, setIsClosing] = useState(false)
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const [replyingTo, setReplyingTo] = useState(null)

  const userId = user ? user.id : null

  // Функция для прокрутки к сообщению
  const scrollToMessage = useCallback((messageId) => {
    const messageElement = document.getElementById(`msg-${messageId}`)
    if (messageElement) {
      messageElement.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest', // Изменено с 'center' на 'nearest' для более точной прокрутки
      })
      messageElement.classList.add('highlighted')
      setTimeout(() => messageElement.classList.remove('highlighted'), 2000)
    }
  }, [])

  const markMessagesAsRead = useCallback(async () => {
    if (!isOpen) return null
    const unreadMessageIds = messages
      .filter((message) => !message.read_status && message.sender_id !== currentUser) // Исключаем сообщения, отправленные текущим пользователем
      .map((message) => message.id)

    if (unreadMessageIds.length > 0) {
      try {
        await axios.post(
          `${API_BASE_URL}5000/api/tasks/${task.id || task.task_id}/mark-messages-as-read`,
          {
            messageIds: unreadMessageIds,
            userId: currentUser, // Передаем ID другого пользователя
          }
        )

        // Обновите состояние сообщений, чтобы отразить изменения
        setMessages((prevMessages) =>
          prevMessages.map((message) =>
            unreadMessageIds.includes(message.id) ? { ...message, read_status: true } : message
          )
        )
      } catch (error) {
        console.error('Ошибка при обновлении статуса прочтения:', error)
      }
    }
  }, [messages, task.id, task.task_id, currentUser, userId])

  useEffect(() => {
    if (isOpen) {
      // Если чат открыт, обновляем статус прочтения только для сообщений, отправленных другим пользователем
      markMessagesAsRead()
    }
  }, [isOpen, markMessagesAsRead])

  // Изменяем stableSetMessages для обработки дубликатов
  const stableSetMessages = useCallback((newMessages) => {
    setMessages((prevMessages) => {
      if (typeof newMessages === 'function') {
        return newMessages(prevMessages)
      }
      return Array.isArray(newMessages)
        ? [...prevMessages, ...newMessages]
        : [...prevMessages, newMessages]
    })
  }, [])

  useWebSocket(userId, stableSetMessages, task.id || task.task_id)

  useEffect(() => {
    if (messagesContainerRef.current) {
      // Прокручиваем контейнер вниз
      messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight
    }
  }, [messages])

  const fetchMessages = useCallback(async () => {
    try {
      const response = await axios.get(
        `${API_BASE_URL}5000/api/tasks/${task.id || task.task_id}/messages-chat-task`,
        {
          params: {
            userId: userId,
          },
        }
      )

      // Обрабатываем сообщения, сохраняя replied_message
      const messagesWithReadStatus = response.data.map((message) => ({
        ...message,
        read: message.read_status,
        taskId: task.id || task.task_id,
        replied_message: message.replied_message
          ? {
              id: message.replied_message.id,
              text: message.replied_message.text,
              sender_id: message.replied_message.sender_id,
              sender_name: message.replied_message.sender_name,
            }
          : null,
      }))

      setMessages(messagesWithReadStatus)
    } catch (error) {
      console.error('Ошибка при загрузке сообщений:', error)
    }
  }, [task.id, task.task_id, userId])

  useEffect(() => {
    /*  useTaskStateTracker
      .getState()
      .resetAuthorMessage(task.task_id || task.id, userId)*/

    if (isOpen) {
      setIsClosing(false)
      fetchMessages()
    }
  }, [isOpen, fetchMessages])

  useEffect(() => {
    if (messages.length > 0) {
      markMessagesAsRead()
    }
  }, [messages, markMessagesAsRead])

  useEffect(() => {
    if (messages.length > 0) {
      // Создаем массив уникальных участников
      const uniqueParticipants = messages.reduce((acc, message) => {
        if (!acc.some((p) => p.id === message.senderId)) {
          acc.push({
            author: message.task_author_id,
            nameImplementer: message.sender_name,
            nameAuthor: message.author_name,
          })
        }
        return acc
      }, [])

      setParticipants(uniqueParticipants)
    }
  }, [messages])

  const handleClose = () => {
    setIsClosing(true)
    setTimeout(() => {
      onClose()
    }, 300) // Время анимации закрытия
  }

  // Модифицируем handleSendMessage
  const handleSendMessage = useCallback(async () => {
    if (!newMessage.trim()) return

    // Проверяем дубликаты более строго
    const isDuplicate = messages.some(
      (msg) =>
        msg.text === newMessage &&
        msg.replied_message?.id === replyingTo?.id &&
        new Date(msg.timestamp).getTime() > Date.now() - 5000
    )

    if (isDuplicate) {
      console.warn('Предотвращена отправка дублирующегося сообщения')
      return
    }

    // Генерируем временный ID с добавлением случайного числа
    const tempId = `${Date.now()}-${Math.floor(Math.random() * 1000)}`

    const tempMessage = {
      id: tempId, // Уникальный временный ID
      sender_id: userId,
      text: newMessage,
      replied_message: replyingTo
        ? {
            id: replyingTo.id,
            sender_id: replyingTo.sender_id,
            text: replyingTo.text,
            sender_name: replyingTo.sender_name,
          }
        : null,
      timestamp: new Date().toISOString(),
      read_status: true,
      sender_name: user?.name,
      task_author_id: task.created_by,
      isTemp: true, // Маркер временного сообщения
    }

    //  setMessages((prev) => [...prev, tempMessage])
    setNewMessage('')
    setReplyingTo(null)

    try {
      const response = await axios.post(
        `${API_BASE_URL}5000/api/tasks/${task.id || task.task_id}/messages-chat-task`,
        {
          senderId: userId,
          text: newMessage,
          taskAuthorId: task.created_by,
          title: task.title,
          repliedToMessageId: replyingTo?.id,
        }
      )

      // Заменяем временное сообщение на постоянное
      setMessages((prev) =>
        prev.map((msg) => (msg.id === tempId ? { ...response.data, id: response.data.id } : msg))
      )
    } catch (error) {
      console.error('Ошибка при отправке сообщения:', error)
      // Удаляем временное сообщение при ошибке
      setMessages((prev) => prev.filter((msg) => msg.id !== tempId))
    }
  }, [newMessage, task, userId, replyingTo, user, messages])

  const onEmojiClick = (emoji) => {
    setNewMessage((prev) => prev + emoji.emoji) // Добавляем эмодзи к текущему тексту сообщения
    setShowEmojiPicker(false) // Закрываем выбор эмодзи после выбора
  }

  const handleReplyToMessage = (message) => {
    setReplyingTo(message)
    // Прокручиваем к полю ввода и фокусируем его
    setTimeout(() => {
      const input = document.querySelector('.chat-input textarea')
      if (input) {
        input.focus()
      }
    }, 100)
  }

  const cancelReply = () => {
    setReplyingTo(null)
  }

  if (!isOpen && !isClosing) return null

  return (
    <>
      <div
        className={`modal-overlay ${isOpen && !isClosing ? 'open' : ''}`}
        onClick={handleClose}
      />
      <div
        className={`chat-modal ${isOpen && !isClosing ? 'open' : ''}`}
        style={{
          transform: isOpen ? `${transformStyle} scale(1)` : `${transformStyle} scale(0.9)`,
        }}
      >
        <div className="chat-header">
          <h3>Чат задачи по теме: &quot;{task.title}&quot;</h3>
          <button className="close-button" onClick={handleClose}>
            x
          </button>
        </div>
        {/* Блок ответа на сообщение (если есть) */}
        {replyingTo && (
          <div className="reply-preview">
            <div className="reply-info">
              <span>Ответ на сообщение:</span>
              <button className="cancel-reply" onClick={cancelReply}>
                ×
              </button>
            </div>
            <div className="reply-content" onClick={() => scrollToMessage(replyingTo.id)}>
              {replyingTo.sender_id === currentUser ? (
                <span className="you-label">Вы:</span>
              ) : (
                <span className="sender-label">{replyingTo.sender_name || 'Отправитель'}:</span>
              )}
              {replyingTo.text.length > 50
                ? `${replyingTo.text.substring(0, 50)}...`
                : replyingTo.text}
            </div>
          </div>
        )}

        {/* Список сообщений */}
        <div className="chat-messages" ref={messagesContainerRef}>
          {messages.map((message) => (
            <div
              key={message.id}
              id={`msg-${message.id}`}
              className={`message ${message.sender_id === currentUser ? 'sent' : 'received'} ${
                message.read_status ? 'read' : 'unread'
              }`}
              onClick={() => handleReplyToMessage(message)}
            >
              {/* Блок ответа на сообщение (если текущее сообщение является ответом) */}
              {message.replied_message && (
                <div
                  className="message-reply"
                  onClick={(e) => {
                    e.stopPropagation()
                    scrollToMessage(message.replied_message.id)
                  }}
                >
                  <div className="reply-line"></div>
                  <div className="reply-content">
                    {message.replied_message.sender_id === currentUser ? (
                      <span className="you-label">Вы:</span>
                    ) : (
                      <span className="sender-label">
                        {message.replied_message.sender_name || 'Отправитель'}:
                      </span>
                    )}
                    {message.replied_message.text.length > 30
                      ? `${message.replied_message.text.substring(0, 30)}...`
                      : message.replied_message.text}
                  </div>
                </div>
              )}
              <div
                className="message-content"
                dangerouslySetInnerHTML={{
                  __html: message.text.replace(/\n/g, '<br />'),
                }}
              />

              <div className="message-time">
                {new Date(message.timestamp).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </div>
              {message.task_author_id === message.sender_id && (
                <div className="author-label">Автор</div>
              )}
            </div>
          ))}
        </div>
        <div className="chat-input">
          <textarea
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                if (e.ctrlKey) {
                  // Если нажата Ctrl+Enter, добавляем новую строку
                  // По умолчанию, в textarea это произойдет, если не предотвращать событие
                  // Поэтому ничего не делаем
                  e.preventDefault()
                  setNewMessage((prev) => prev + '\n')

                  return
                } else if (e.shiftKey) {
                  // Shift+Enter — добавляем новую строку (по умолчанию в textarea)
                  // ничего не делаем, событие продолжит обработку
                  return
                } else {
                  // Простое Enter — отправляем сообщение
                  e.preventDefault() // Предотвращаем переход на новую строку
                  handleSendMessage()
                }
              }
            }}
            placeholder="Напишите сообщение..."
            rows={2} // Начальное количество строк
            style={{ resize: 'none', whiteSpace: 'pre-line' }}
          />
          {/* Кнопка для выбора эмодзи */}
          <button onClick={() => setShowEmojiPicker((prev) => !prev)}>
            😊 {/* Здесь можно использовать иконку эмодзи или другую иконку */}
          </button>

          {/* Компонент выбора эмодзи */}

          <button onClick={handleSendMessage}>Отправить</button>
        </div>
        {showEmojiPicker && (
          <div className="emoji-picker-container-task">
            <EmojiPicker onEmojiClick={onEmojiClick} />
          </div>
        )}
        <div className="chat-participants">
          <h4>Участники:</h4>
          <div className="participants-list">
            {participants.length > 0 ? (
              participants.map((participant) => (
                <div className="participant" key={participant.author}>
                  {/* Здесь вы можете выбрать, что именно отображать: имя автора или имя исполнителя */}
                  <div>{participant.nameImplementer} (Исполнитель)</div>
                  <div>{participant.nameAuthor} (Автор)</div>
                </div>
              ))
            ) : (
              <div className="no-participants">Нет участников</div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}

export default ChatTaskModal
