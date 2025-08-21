import axios from 'axios'
import Toastify from 'toastify-js'
import { API_BASE_URL } from '../../../../../config'

const useCompleteNotifications = (
  columns,
  setColumns,
  setReminders,
  userId
) => {
  const handleCompleteTask = async (taskId) => {
    if (!columns.notifications?.items) {
      console.error('Колонка уведомлений пуста или не существует')
      return
    }
    const taskToComplete = columns.notifications.items.find(
      (task) => task.id === taskId
    )

    if (!taskToComplete) {
      console.error('Задача не найдена')
      return
    }

    const reminderData = {
      id: taskId,
      is_completed: true,
      completed_at: new Date().toISOString(),
    }

    try {
      const response = await axios.patch(
        `${API_BASE_URL}5004/api/reminders/complete`,
        reminderData
      )

      if (response.status === 200) {
        setColumns((prevColumns) => {
          const newNotifications = prevColumns.notifications.items.filter(
            (task) => task.id !== taskId
          )
          return {
            ...prevColumns,
            notifications: {
              ...prevColumns.notifications,
              items: newNotifications,
            },
          }
        })

        const fetchReminders = async () => {
          try {
            const response = await axios.get(
              `${API_BASE_URL}5004/api/reminders?userId=${userId}`
            )
            setReminders(response.data)
          } catch (error) {
            console.error('Ошибка при получении напоминаний:', error)
          }
        }
        fetchReminders()

        Toastify({
          text: `Уведомление ${taskToComplete.id} завершено: "${taskToComplete.title}"`,
          duration: 5000,
          close: true,
          backgroundColor: 'linear-gradient(to right, #007BFF, #0056b3)',
        }).showToast()
      }
    } catch (error) {
      console.error('Ошибка при завершении задачи', error)
    }
  }

  return { handleCompleteTask }
}

export default useCompleteNotifications
