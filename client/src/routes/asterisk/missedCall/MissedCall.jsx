import { useState, useEffect, useCallback } from 'react'
import axios from 'axios'
import { io } from 'socket.io-client'
import { CircularProgress, Pagination } from '@mui/material'
import NotificationList from '../../../components/notificationList/NotificationList'
import { Modal, Box, TextField, Button, Select, MenuItem } from '@mui/material'
import { API_BASE_URL } from '../../../../config'
import useUserStore from '../../../store/userStore'

const MissedCalls = () => {
  const { user } = useUserStore()
  const [isLoading, setLoading] = useState(true)
  const [showEmployee, setShowEmployee] = useState(true)
  const [missedCalls, setMissedCalls] = useState([])
  const [dealers, setDealers] = useState([])
  const [companies, setCompanies] = useState([])
  const [open, setOpen] = useState(false)
  const [selectedDealer, setSelectedDealer] = useState('')
  const [phoneNumber, setPhoneNumber] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [phoneType, setPhoneType] = useState('мобильный')
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 7,
    total: 0,
  })
  const [selectedReceiver, setSelectedReceiver] = useState(null)
  const [availableReceivers, setAvailableReceivers] = useState([])
  const [selectedEmployee, setSelectedEmployee] = useState(null) // null - все, 'undefined' - неопределенные, число - ID сотрудника
  const [availableEmployees, setAvailableEmployees] = useState([])

  const userId = user?.id
  const position = user?.position
  // Функция загрузки звонков
  const fetchMissedCalls = useCallback(
    async (page = 1) => {
      try {
        setLoading(true)
        const response = await axios.get(`${API_BASE_URL}5004/api/calls`, {
          params: {
            status: 'missed',
            page,
            limit: pagination.limit,
            ...(position !== 'НОК' && { userId }), // Передаем userId только если position не "НОК"
            ...(selectedEmployee !== null && {
              [selectedEmployee === 'undefined' ? 'unassigned' : 'userId']:
                selectedEmployee === 'undefined' ? true : selectedEmployee,
            }),
            ...(selectedReceiver !== null && {
              receiverId: selectedReceiver === 'undefined' ? null : selectedReceiver,
            }),
          },
        })

        // Остальная часть функции остается без изменений
        if (!Array.isArray(response.data?.data)) {
          throw new Error('Invalid data format: expected array')
        }

        const { data, total } = response.data

        const filteredData = data
          .filter((call) => {
            if (!showEmployee) {
              const callerNumber = parseInt(call.caller_number, 10)
              return callerNumber < 0 || callerNumber > 999
            }
            return true
          })
          .map((call) => ({
            id: call.call_id,
            text: `Пропущенный звонок от: ${call.caller_number}`,
            time: new Date(call.accepted_at).toLocaleString('ru-RU', {
              dateStyle: 'short',
              timeStyle: 'short',
            }),
            callerName: call.caller_name,
            receiverName: call.receiver_name,
            callerNumber: call.caller_number,
            receiverNumber: call.receiver_number,
            dealerId: call.dealer_id,
            dateTime: new Date(call.accepted_at),
            status: call.status,
          }))

        const sortedData = [...filteredData].sort((a, b) => b.dateTime - a.dateTime)

        setMissedCalls(sortedData)
        setPagination((prev) => ({
          ...prev,
          page,
          total,
        }))
      } catch (error) {
        console.error('Ошибка при получении данных о звонках:', error)
      } finally {
        setLoading(false)
      }
    },
    [showEmployee, pagination.limit, position, selectedEmployee, selectedReceiver] // Добавьте position в зависимости
  )

  useEffect(() => {
    const extractReceivers = () => {
      const receiversSet = new Set()

      missedCalls.forEach((call) => {
        if (call.receiverName && call.receiverNumber) {
          const key = `${call.receiverNumber}|${call.receiverName}`
          receiversSet.add(key)
        }
      })

      const receiversArray = Array.from(receiversSet).map((item) => {
        const [number, name] = item.split('|')
        return {
          number,
          name,
          fullName: `${name} (${number})`,
        }
      })

      setAvailableReceivers(receiversArray)
    }

    if (missedCalls.length > 0) {
      extractReceivers()
    }
  }, [missedCalls])

  // Загрузка дилеров
  const fetchDealers = useCallback(async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}5003/api/dealers/all`)
      setDealers(response.data)
    } catch (error) {
      console.error('Ошибка при получении данных о дилерах:', error)
    }
  }, [])

  // Загрузка компаний
  const fetchCompanies = useCallback(async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}5003/api/companies`)
      setCompanies(response.data)
    } catch (error) {
      console.error('Ошибка при получении данных о компаниях:', error)
    }
  }, [])

  // Загрузка настроек пользователя
  const fetchUserSettings = useCallback(async () => {
    const userData = JSON.parse(localStorage.getItem('userData'))
    const userId = userData?.id

    if (userId) {
      try {
        const response = await axios.get(`${API_BASE_URL}5004/api/calls-settings-missed/${userId}`)
        setShowEmployee(response.data.showMissedCallsEmployee)
      } catch (error) {
        console.error('Ошибка получения настроек пользователя:', error)
      }
    }
  }, [])

  useEffect(() => {
    const socket = io(`${API_BASE_URL}5004`)

    // Инициализация данных
    const initData = async () => {
      try {
        await Promise.all([
          fetchUserSettings(),
          fetchDealers(),
          fetchCompanies(),
          fetchMissedCalls(1),
        ])
      } catch (error) {
        console.error('Ошибка инициализации данных:', error)
      }
    }

    initData()

    socket.on('new_call', () => {
      fetchMissedCalls(pagination.page)
    })

    return () => {
      socket.disconnect()
    }
  }, [fetchUserSettings, fetchDealers, fetchCompanies, fetchMissedCalls])

  // Обработчик изменения страницы
  const handlePageChange = useCallback((event, newPage) => {
    setPagination((prev) => ({ ...prev, page: newPage }))
  }, [])

  // Эффект для загрузки данных при изменении страницы
  useEffect(() => {
    fetchMissedCalls(pagination.page)
  }, [pagination.page, fetchMissedCalls])
  // Обработчики остаются без изменений
  const handleOpen = (notification) => {
    setPhoneNumber(notification.callerNumber)
    setOpen(true)
  }

  const handleClose = () => {
    setOpen(false)
    setSelectedDealer('')
    setPhoneNumber('')
    setCompanyName('')
    setPhoneType('мобильный')
  }

  const handleDealerChange = (dealerId) => {
    setSelectedDealer(dealerId)
    const dealer = dealers.find((d) => d.id === dealerId)
    if (dealer) {
      const company = companies.find((c) => c.id === dealer.company_id)
      setCompanyName(company ? company.name : '')
    }
  }

  const handleAddPhoneNumber = async () => {
    if (!selectedDealer) return alert('Выберите дилера')

    try {
      const response = await axios.post(`${API_BASE_URL}5004/api/add-phone`, {
        dealerId: selectedDealer,
        phoneNumber,
        phoneType,
        isPrimary: true,
      })

      if (response.status === 201) {
        alert('Номер телефона добавлен')
        handleClose()
      } else {
        alert('Ошибка при добавлении номера')
      }
    } catch (error) {
      console.error('Ошибка:', error)
      alert('Ошибка при добавлении номера')
    }
  }

  if (isLoading) {
    return (
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          height: '100vh',
        }}
      >
        <CircularProgress className="progress" color="primary" size={50} variant="indeterminate" />
      </div>
    )
  }

  return (
    <div className="container">
      {/* Блок с кнопками фильтрации по сотрудникам */}

      {/* Блок с кнопками фильтрации по получателям */}
      <div
        className="filter-buttons"
        style={{ marginBottom: '20px', display: 'flex', gap: '10px', flexWrap: 'wrap' }}
      >
        <h4>Фильтр по получателю:</h4>
        <button
          onClick={() => setSelectedReceiver('undefined')}
          style={{
            padding: '8px 16px',
            backgroundColor: selectedReceiver === 'undefined' ? '#1976d2' : '#f0f0f0',
            color: selectedReceiver === 'undefined' ? 'white' : 'black',
            border: '1px solid #ddd',
            borderRadius: '4px',
            cursor: 'pointer',
          }}
        >
          Все
        </button>

        {availableReceivers.map((receiver, index) => (
          <button
            key={index}
            onClick={() => {
              setSelectedReceiver(receiver.number)
              setSelectedEmployee(null)
            }}
            style={{
              padding: '8px 16px',
              backgroundColor: selectedReceiver === receiver.number ? '#1976d2' : '#f0f0f0',
              color: selectedReceiver === receiver.number ? 'white' : 'black',
              border: '1px solid #ddd',
              borderRadius: '4px',
              cursor: 'pointer',
            }}
          >
            {receiver.fullName}
          </button>
        ))}
      </div>
      <NotificationList
        title="Пропущенные звонки"
        notifications={missedCalls}
        statusTitle="Пропущенный"
        onAddPhoneClick={handleOpen}
      />
      <Pagination
        count={Math.ceil(pagination.total / pagination.limit)}
        page={pagination.page}
        onChange={handlePageChange}
        color="primary"
        style={{ marginTop: 20, display: 'flex', justifyContent: 'center' }}
      />

      <Modal open={open} onClose={handleClose}>
        <Box
          sx={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: 400,
            bgcolor: 'background.paper',
            boxShadow: 24,
            p: 4,
            borderRadius: 1,
          }}
        >
          <h2>Добавить номер телефона</h2>
          <TextField
            label="Номер телефона"
            value={phoneNumber}
            onChange={(e) => setPhoneNumber(e.target.value)}
            fullWidth
            margin="normal"
          />
          <Select
            value={selectedDealer}
            onChange={(e) => handleDealerChange(e.target.value)}
            fullWidth
            displayEmpty
            margin="normal"
          >
            <MenuItem value="" disabled>
              Выберите дилера
            </MenuItem>
            {dealers.map((dealer) => (
              <MenuItem key={dealer.id} value={dealer.id}>
                {dealer.first_name} {dealer.last_name}
              </MenuItem>
            ))}
          </Select>
          <Select
            value={phoneType}
            onChange={(e) => setPhoneType(e.target.value)}
            fullWidth
            displayEmpty
            margin="normal"
          >
            <MenuItem value="мобильный">Мобильный</MenuItem>
            <MenuItem value="домашний">Домашний</MenuItem>
            <MenuItem value="рабочий">Рабочий</MenuItem>
          </Select>
          {companyName && <p>Компания: {companyName}</p>}
          <Button variant="contained" color="primary" onClick={handleAddPhoneNumber}>
            Добавить
          </Button>
        </Box>
      </Modal>
    </div>
  )
}

export default MissedCalls
