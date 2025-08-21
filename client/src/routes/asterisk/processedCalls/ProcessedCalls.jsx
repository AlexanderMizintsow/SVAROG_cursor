import { useState, useEffect } from 'react'
import axios from 'axios'
import { CircularProgress, Pagination } from '@mui/material'
import NotificationList from '../../../components/notificationList/NotificationList'
import { Modal, Box, TextField, Button, Select, MenuItem } from '@mui/material'
import { API_BASE_URL } from '../../../../config'
import useUserStore from '../../../store/userStore'

const ProcessedCalls = () => {
  const { user } = useUserStore()
  const [isLoading, setLoading] = useState(true)
  const [processedCalls, setProcessedCalls] = useState([])
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
  const userId = user?.id
  const position = user?.position

  const fetchProcessedCalls = async (page = 1) => {
    try {
      setLoading(true)
      const response = await axios.get(`${API_BASE_URL}5004/api/calls`, {
        params: {
          status: 'processed',
          page,
          limit: pagination.limit,
          ...(position !== 'НОК' && { userId }),
        },
      })

      const { data, total } = response.data

      const formattedData = data.map((call) => ({
        id: call.call_id,
        text: `Обработанный звонок от: ${call.caller_number}`,
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

      const sortedData = formattedData.sort((a, b) => b.dateTime - a.dateTime)

      setProcessedCalls(sortedData)
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
  }

  const fetchDealers = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}5003/api/dealers/all`)
      setDealers(response.data)
    } catch (error) {
      console.error('Ошибка при получении данных о дилерах:', error)
    }
  }

  const fetchCompanies = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}5003/api/companies`)
      setCompanies(response.data)
    } catch (error) {
      console.error('Ошибка при получении данных о компаниях:', error)
    }
  }

  useEffect(() => {
    const initData = async () => {
      try {
        await Promise.all([fetchProcessedCalls(1), fetchDealers(), fetchCompanies()])
      } catch (error) {
        console.error('Ошибка инициализации данных:', error)
      }
    }

    initData()
  }, [])

  const handlePageChange = (event, newPage) => {
    setPagination((prev) => ({ ...prev, page: newPage }))
  }

  useEffect(() => {
    fetchProcessedCalls(pagination.page)
  }, [pagination.page])

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
      <NotificationList
        title="Обработанные звонки"
        notifications={processedCalls}
        statusTitle="Обработанный"
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

export default ProcessedCalls
