import { useState, useEffect } from 'react'
import axios from 'axios'
import { API_BASE_URL } from '../../../../config'
import Toastify from 'toastify-js'
import EmployeeForm from './EmployeeForm'
import ConfirmationDialog from '../../../components/confirmationDialog/ConfirmationDialog'
import PhoneNumbersDialog from './PhoneNumbersDialog'
import Btn from '../../../components/btn/Btn'
import UserDeletion from './UserDeletion'
import SearchBar from '../../../components/searchBar/SearchBar'
import useKanbanStore from '../../../store/useKanbanStore'
import ChangePassword from './ChangePassword'
import { FcTwoSmartphones } from 'react-icons/fc'
import { TbPasswordUser } from 'react-icons/tb'
import './accountActivation.scss'

function AccountActivation() {
  const [usersData, setUsersData] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [roles, setRoles] = useState([])
  const [departments, setDepartments] = useState([])
  const [positions, setPositions] = useState([])
  const [supervisors, setSupervisors] = useState([])
  const [dialogOpen, setDialogOpen] = useState(false)
  const [currentDelete, setCurrentDelete] = useState(null)
  const [refreshData, setRefreshData] = useState(false)
  const [selectedUserId, setSelectedUserId] = useState(null)
  const [phoneNumbersDialogOpen, setPhoneNumbersDialogOpen] = useState(false)
  const [noteDialogOpen, setNoteDialogOpen] = useState(false)
  const [selectedUserIdForNote, setSelectedUserIdForNote] = useState(null)

  const [searchTerm, setSearchTerm] = useState('')
  const { fetchEmployees } = useKanbanStore()

  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await axios.get(`${API_BASE_URL}5000/api/users`)

        const usersDataWithFullName = response.data.map((user) => ({
          ...user,
          fullName: `${user.last_name} ${user.first_name} ${user.middle_name}`,
        }))

        setUsersData(usersDataWithFullName)

        const [
          rolesResponse,
          departmentsResponse,
          positionsResponse,
          supervisorsResponse,
        ] = await Promise.all([
          axios.get(`${API_BASE_URL}5000/api/roles`),
          axios.get(`${API_BASE_URL}5000/api/departments`),
          axios.get(`${API_BASE_URL}5000/api/positions`),
          axios.get(`${API_BASE_URL}5000/api/users?role_id=2`),
        ])

        setRoles(rolesResponse.data)
        setDepartments(departmentsResponse.data)
        setPositions(positionsResponse.data)
        const supervisorsData = supervisorsResponse.data.map((supervisor) => ({
          ...supervisor,
          fullName: `${supervisor.last_name} ${supervisor.first_name} ${supervisor.middle_name}`,
        }))
        setSupervisors(supervisorsData)
      } catch (error) {
        console.error('Ошибка при получении данных:', error)
      } finally {
        setIsLoading(false)
      }
    }

    fetchData()
  }, [refreshData])

  const filteredUsersData = usersData.filter((user) => {
    const searchLowerCase = searchTerm.toLowerCase()
    return (
      user.fullName.toLowerCase().includes(searchLowerCase) ||
      user.email.toLowerCase().includes(searchLowerCase) ||
      (user.role && user.role.name.toLowerCase().includes(searchLowerCase)) ||
      (user.department &&
        user.department.name.toLowerCase().includes(searchLowerCase))
    )
  })

  if (isLoading) {
    return (
      <div className="loading-container">
        <p>Загрузка...</p>
      </div>
    )
  }

  const handleViewPhones = (userId) => {
    setSelectedUserId(userId)
    setPhoneNumbersDialogOpen(true)
  }

  const handlePhoneNumbersDialogClose = () => {
    setPhoneNumbersDialogOpen(false)
    setSelectedUserId(null)
  }

  const handleInputChange = (e, userId, field) => {
    const { value, type, checked } = e.target
    setUsersData((prevData) =>
      prevData.map((user) =>
        user.id === userId
          ? { ...user, [field]: type === 'checkbox' ? checked : value }
          : user
      )
    )
  }

  const handleSave = (userId) => {
    const user = usersData.find((user) => user.id === userId)
    const token = localStorage.getItem('token')

    // Создайте объект с необходимыми полями для обновления
    const updatedUserData = {
      last_name: user.last_name,
      first_name: user.first_name,
      middle_name: user.middle_name,
      gender: user.gender,
      email: user.email,
      birth_date: user.birth_date,
      role_id: user.role_id,
      department_id: user.department_id,
      position_id: user.position_id,
      supervisor_id: user.supervisor_id || null,
      role_assigned: user.role_assigned,
    }

    axios
      .put(`${API_BASE_URL}5000/api/users/${userId}`, updatedUserData, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })
      .then(() => {
        fetchEmployees(JSON.parse(localStorage.getItem('userData'))?.id)

        Toastify({
          text: 'Данные пользователя обновлены',
          close: true,
          style: {
            background: 'linear-gradient(to right, #00b09b, #96c93d)',
          },
        }).showToast()
        setRefreshData(!refreshData)
      })
      .catch((error) => {
        Toastify({
          text: 'Ошибка обновления данных',
          close: true,
          style: {
            background: 'linear-gradient(to right, #ff7e79, #ff1e00)',
          },
        }).showToast()
      })
  }

  const formatDate = (isoString) => {
    if (!isoString) return '-'
    const date = new Date(isoString)
    const day = date.getDate().toString().padStart(2, '0')
    const month = (date.getMonth() + 1).toString().padStart(2, '0')
    const year = date.getFullYear()
    return `${day}.${month}.${year}`
  }

  const handleDeleteComplete = (deletedUserId) => {
    setUsersData((prevData) =>
      prevData.filter((user) => user.id !== deletedUserId)
    )
    setRefreshData(!refreshData)
  }
  const handleDelete = (userId) => {
    const user = usersData.find((user) => user.id === userId)
    setCurrentDelete(user)
    setDialogOpen(true)
  }

  const handleOpenNoteDialog = (userId) => {
    setSelectedUserIdForNote(userId)
    setNoteDialogOpen(true)
  }

  return (
    <>
      <div className="searchAccount">
        <SearchBar
          searchTerm={searchTerm}
          setSearchTerm={setSearchTerm}
          placeholder="Поиск ..."
        />
      </div>

      <div className="AccountActivation">
        <EmployeeForm
          setRefreshData={setRefreshData}
          refreshData={refreshData}
        />

        <div className="card-container">
          {filteredUsersData.map((user) => (
            <div key={user.id} className={`user-card`}>
              <div className="card-content">
                <div className="card-content-admin-info">
                  <div>
                    <h6>ID: {user.id}</h6>
                    <h6>username: {user.username}</h6>
                  </div>
                  <TbPasswordUser
                    className="card-content-admin-info-password"
                    title="Сменить пароль"
                    onClick={() => handleOpenNoteDialog(user.id)}
                  />
                </div>
                <div>
                  Фамилия:{' '}
                  <input
                    type="text"
                    value={user.last_name || ''}
                    onChange={(e) => handleInputChange(e, user.id, 'last_name')}
                  />
                </div>
                <div>
                  Имя:{' '}
                  <input
                    type="text"
                    value={user.first_name || ''}
                    onChange={(e) =>
                      handleInputChange(e, user.id, 'first_name')
                    }
                  />
                </div>
                <div>
                  Отчество:{' '}
                  <input
                    type="text"
                    value={user.middle_name || ''}
                    onChange={(e) =>
                      handleInputChange(e, user.id, 'middle_name')
                    }
                  />
                </div>
                <div>
                  Пол:
                  <select
                    value={user.gender || ''}
                    onChange={(e) => handleInputChange(e, user.id, 'gender')}
                  >
                    <option value="">Выберите пол</option>
                    <option value="Муж">Муж.</option>
                    <option value="Жен">Жен.</option>
                  </select>
                </div>
                <div>
                  Email:{' '}
                  <input
                    type="text"
                    value={user.email || ''}
                    onChange={(e) => handleInputChange(e, user.id, 'email')}
                  />
                </div>
                {/* <p>Email: {user.email || ''}</p>*/}
                <div>
                  Дата рождения: {formatDate(user.birth_date) || ''}
                  <div>
                    {' '}
                    <input
                      type="date"
                      onChange={(e) =>
                        handleInputChange(e, user.id, 'birth_date')
                      }
                    />
                  </div>
                </div>
                <div>
                  Роль:
                  <select
                    value={user.role_id || ''}
                    onChange={(e) => handleInputChange(e, user.id, 'role_id')}
                  >
                    <option value="" disabled>
                      Выберите роль
                    </option>
                    {roles.map((role) => (
                      <option key={role.id} value={role.id}>
                        {role.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  Отдел:
                  <select
                    value={user.department_id || ''}
                    onChange={(e) =>
                      handleInputChange(e, user.id, 'department_id')
                    }
                  >
                    <option value="" disabled>
                      Выберите отдел
                    </option>
                    {departments.map((dept) => (
                      <option key={dept.id} value={dept.id}>
                        {dept.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  Должность:
                  <select
                    value={user.position_id || ''}
                    onChange={(e) =>
                      handleInputChange(e, user.id, 'position_id')
                    }
                  >
                    <option value="" disabled>
                      Выберите должность
                    </option>
                    {positions.map((position) => (
                      <option key={position.id} value={position.id}>
                        {position.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  Руководитель:
                  <select
                    value={user.supervisor_id || ''}
                    onChange={(e) =>
                      handleInputChange(e, user.id, 'supervisor_id')
                    }
                  >
                    <option value="">Выберите руководителя</option>
                    {supervisors.map((supervisor) => (
                      <option key={supervisor.id} value={supervisor.id}>
                        {supervisor.fullName}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  Активация: <span> </span>
                  <label className="custom-checkbox">
                    <input
                      type="checkbox"
                      checked={!!user.role_assigned}
                      onChange={(e) =>
                        handleInputChange(e, user.id, 'role_assigned')
                      }
                    />
                    <span className="checkmark"></span>
                  </label>
                </div>
              </div>
              <div className="card-actions">
                <FcTwoSmartphones
                  style={{ fontSize: '40px', cursor: 'pointer' }}
                  color={'royalblue'}
                  title="Телефоны"
                  onClick={() => handleViewPhones(user.id)}
                />

                <Btn text="Сохранить" onClick={() => handleSave(user.id)} />
                <Btn
                  text="Удалить"
                  onClick={() => handleDelete(user.id)}
                  color="#dc3545"
                />
              </div>
            </div>
          ))}
        </div>
        <UserDeletion
          open={dialogOpen}
          onClose={() => setDialogOpen(false)}
          user={currentDelete}
          onDeleteComplete={handleDeleteComplete}
        />
        <PhoneNumbersDialog
          open={phoneNumbersDialogOpen}
          onClose={handlePhoneNumbersDialogClose}
          userId={selectedUserId}
        />
        {/* Модальное окно для смены пароля */}
        <ChangePassword
          isOpen={noteDialogOpen}
          onClose={() => setNoteDialogOpen(false)}
          userId={selectedUserIdForNote}
        />
      </div>
    </>
  )
}

export default AccountActivation
//1
