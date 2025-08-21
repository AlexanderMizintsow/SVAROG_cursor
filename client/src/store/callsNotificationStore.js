import { create } from 'zustand'

const callsNotificationStore = create((set) => ({
  missedCount: 0,
  appRestart: false, // Переменная для отслеживания перезапуска приложения
  setMissedCount: async (count) => {
    set({ missedCount: count })
  },
  toggleAppRestart: () => set((state) => ({ appRestart: !state.appRestart })), // Переключение состояния
}))

export default callsNotificationStore
