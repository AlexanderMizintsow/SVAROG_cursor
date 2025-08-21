import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { FcPlanner } from 'react-icons/fc'
import { IoNotificationsOffOutline } from 'react-icons/io5'
import { MdKeyboardArrowDown, MdKeyboardArrowUp } from 'react-icons/md'
import UserStore from '../../store/userStore'
import useRemindersStore from '../../store/useRemindersStore'
import callsNotificationStore from '../../store/callsNotificationStore'
import './navbar.scss'
import useKanbanStore from '../../store/useKanbanStore'

const Menu = ({ title, menuItems }) => {
  const { user } = UserStore()
  const { reminders } = useRemindersStore()
  const { groupCounts } = useRemindersStore()
  const missedCount = callsNotificationStore((state) => state.missedCount)
  const [openCloseIndex, setOpenCloseIndex] = useState(null)
  const { selectedEmployeeId } = useKanbanStore()

  const navigate = useNavigate()
  const handleMissedCountClick = () => {
    navigate('/notifications-asterisk-missed-calls')
  }

  const userId = user ? user.id : null
  const userReminders = reminders.filter((reminder) => reminder.user_id === selectedEmployeeId)

  const toggleSubMenu = (index) => {
    setOpenCloseIndex(openCloseIndex === index ? null : index)
  }

  return (
    <div className="menu crmmenu ">
      <h5>{title}</h5>
      {menuItems.map((item, index) => (
        <React.Fragment key={index}>
          <div
            className="menu-item"
            onClick={() => (item.subMenuItems ? toggleSubMenu(index) : null)}
          >
            {item.icon && <item.icon className="icon" />}
            <p>
              {item.link ? (
                <Link to={item.link} className="menu-link">
                  {item.name}
                  {item.name === 'Рабочие группы' && (
                    <>
                      {groupCounts.fixedCount > 0 && (
                        <span className="notification-circle fixed-count">
                          {groupCounts.fixedCount}
                        </span>
                      )}

                      {groupCounts.rangeCount > 0 && (
                        <>
                          <span className="notification-circle range-count">
                            {groupCounts.rangeCount}
                          </span>
                          <FcPlanner />
                        </>
                      )}
                    </>
                  )}
                </Link>
              ) : (
                item.name
              )}
            </p>
            {item.name === 'Менеджер задач' && (
              <>
                <span>
                  {userReminders.length ? (
                    <span className="notification-container">
                      <IoNotificationsOffOutline className="notification-reminder" />
                      <span className="notification-reminder-count">-{userReminders.length}- </span>
                    </span>
                  ) : (
                    ''
                  )}
                </span>
                <span style={{ color: 'red', marginLeft: '10px' }}>
                  {selectedEmployeeId !== userId ? 'Режим проверки!' : ''}
                </span>
              </>
            )}
            {item.name === 'Телефония (asterisk)' && (
              <span>
                {missedCount > 0 && (
                  <span
                    onClick={handleMissedCountClick}
                    className="notification-circle miss-count"
                    title="Пропущенные звонки"
                  >
                    {missedCount}
                  </span>
                )}
              </span>
            )}
            {item.subMenuItems && openCloseIndex === index ? (
              <MdKeyboardArrowUp className="arrow" />
            ) : item.subMenuItems ? (
              <MdKeyboardArrowDown className="arrow" />
            ) : null}
          </div>
          {openCloseIndex === index && item.subMenuItems && (
            <div className="submenu">
              {item.subMenuItems.map((subItem, subIndex) => (
                <Link key={subIndex} to={subItem.link} className="submenu-item">
                  {subItem.name}

                  {subItem.icon && (
                    <subItem.icon
                      className={`icon ${subItem.name === 'Пропущенные звонки' ? ' red-icon' : ''}`}
                    />
                  )}
                </Link>
              ))}
            </div>
          )}
        </React.Fragment>
      ))}
    </div>
  )
}

export default Menu
