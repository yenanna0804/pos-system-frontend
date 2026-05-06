import { useState, useRef, useEffect } from 'react';
import './DateTimePicker.css';

type Props = {
  value: Date;
  onChange: (date: Date) => void;
  onClose: () => void;
  errorMessage?: string | null;
};

const MONTH_NAMES = [
  'Tháng 1', 'Tháng 2', 'Tháng 3', 'Tháng 4', 'Tháng 5', 'Tháng 6',
  'Tháng 7', 'Tháng 8', 'Tháng 9', 'Tháng 10', 'Tháng 11', 'Tháng 12',
];
const DAY_NAMES = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];

function ChevronLeftIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 18l-6-6 6-6" />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

function ChevronUpIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 15l-6-6-6 6" />
    </svg>
  );
}

function ChevronDownIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 6v6l4 2" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 6L6 18" />
      <path d="M6 6l12 12" />
    </svg>
  );
}

function getDaysInMonth(date: Date) {
  const year = date.getFullYear();
  const month = date.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const days: (number | null)[] = [];
  const adjustedFirstDay = firstDay === 0 ? 6 : firstDay - 1;
  for (let i = 0; i < adjustedFirstDay; i++) days.push(null);
  for (let i = 1; i <= daysInMonth; i++) days.push(i);
  return days;
}

function isSameDay(d1: Date, d2: Date) {
  return d1.getDate() === d2.getDate() && d1.getMonth() === d2.getMonth() && d1.getFullYear() === d2.getFullYear();
}

export default function DateTimePicker({ value, onChange, onClose, errorMessage = null }: Props) {
  const [selectedDate, setSelectedDate] = useState(value);
  const [selectedTime, setSelectedTime] = useState({ hour: value.getHours(), minute: value.getMinutes() });
  const [editingField, setEditingField] = useState<'hour' | 'minute' | null>(null);
  const [editingValue, setEditingValue] = useState('');
  const [activeTab, setActiveTab] = useState<'date' | 'time'>('date');
  const [viewMonth, setViewMonth] = useState(new Date(value.getFullYear(), value.getMonth(), 1));
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  const handleDateSelect = (day: number) => {
    setSelectedDate(new Date(viewMonth.getFullYear(), viewMonth.getMonth(), day));
    setActiveTab('time');
  };

  const handleConfirm = () => {
    const result = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate(), selectedTime.hour, selectedTime.minute, 0, 0);
    onChange(result);
  };

  const handleToday = () => {
    const now = new Date();
    setSelectedDate(now);
    setSelectedTime({ hour: now.getHours(), minute: now.getMinutes() });
    setViewMonth(new Date(now.getFullYear(), now.getMonth(), 1));
  };

  const commitEditingValue = () => {
    if (!editingField) return;
    const num = parseInt(editingValue, 10);
    if (editingField === 'hour' && !isNaN(num) && num >= 0 && num <= 23) {
      setSelectedTime((t) => ({ ...t, hour: num }));
    } else if (editingField === 'minute' && !isNaN(num) && num >= 0 && num <= 59) {
      setSelectedTime((t) => ({ ...t, minute: num }));
    }
    setEditingField(null);
  };

  const changeMonth = (direction: number) => {
    const d = new Date(viewMonth);
    d.setMonth(d.getMonth() + direction);
    setViewMonth(d);
  };

  const today = new Date();
  const days = getDaysInMonth(viewMonth);

  const quickTimes = [
    { label: '08:00', h: 8, m: 0 },
    { label: '09:30', h: 9, m: 30 },
    { label: '12:00', h: 12, m: 0 },
    { label: '14:00', h: 14, m: 0 },
    { label: '17:30', h: 17, m: 30 },
    { label: '19:00', h: 19, m: 0 },
    { label: '21:00', h: 21, m: 0 },
    { label: 'Hiện tại', h: new Date().getHours(), m: new Date().getMinutes() },
  ];

  return (
    <div className="dtp-overlay">
      <div className="dtp-container" ref={containerRef}>
        <div className="dtp-topbar">
          <button type="button" className="dtp-close-btn" onClick={onClose} aria-label="Đóng popup chọn ngày giờ">
            <CloseIcon />
          </button>
        </div>
        <div className="dtp-tabs">
          <button type="button" className={`dtp-tab${activeTab === 'date' ? ' active' : ''}`} onClick={() => setActiveTab('date')}>
            <CalendarIcon /> Ngày
          </button>
          <button type="button" className={`dtp-tab${activeTab === 'time' ? ' active' : ''}`} onClick={() => setActiveTab('time')}>
            <ClockIcon /> Giờ
          </button>
        </div>

        {activeTab === 'date' && (
          <div className="dtp-calendar">
            <div className="dtp-month-nav">
              <button type="button" className="dtp-month-btn" onClick={() => changeMonth(-1)}><ChevronLeftIcon /></button>
              <h3>{MONTH_NAMES[viewMonth.getMonth()]} {viewMonth.getFullYear()}</h3>
              <button type="button" className="dtp-month-btn" onClick={() => changeMonth(1)}><ChevronRightIcon /></button>
            </div>
            <div className="dtp-day-names">
              {DAY_NAMES.map((d) => <span key={d}>{d}</span>)}
            </div>
            <div className="dtp-days">
              {days.map((day, idx) => {
                if (day === null) return <div key={idx} />;
                const dateToCheck = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), day);
                const isSelected = isSameDay(dateToCheck, selectedDate);
                const isToday = day === today.getDate() && viewMonth.getMonth() === today.getMonth() && viewMonth.getFullYear() === today.getFullYear();
                let cls = 'dtp-day';
                if (isSelected) cls += ' selected';
                else if (isToday) cls += ' today';
                return (
                  <button type="button" key={idx} className={cls} onClick={() => handleDateSelect(day)}>
                    {day}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {activeTab === 'time' && (
          <div className="dtp-time">
            <div className="dtp-time-spinners">
              <div className="dtp-spinner">
                <span className="dtp-spinner-label">GIỜ</span>
                <div className="dtp-spinner-box">
                  <button type="button" className="dtp-spin-btn" onClick={() => setSelectedTime((t) => ({ ...t, hour: (t.hour + 1) % 24 }))}>
                    <ChevronUpIcon />
                  </button>
                  {editingField === 'hour' ? (
                    <input
                      className="dtp-spin-input"
                      type="text"
                      inputMode="numeric"
                      maxLength={2}
                      value={editingValue}
                      autoFocus
                      onChange={(e) => setEditingValue(e.target.value.replace(/\D/g, ''))}
                      onBlur={commitEditingValue}
                      onKeyDown={(e) => { if (e.key === 'Enter') commitEditingValue(); }}
                    />
                  ) : (
                    <div className="dtp-spin-value" onClick={() => { setEditingField('hour'); setEditingValue(String(selectedTime.hour).padStart(2, '0')); }}>
                      {String(selectedTime.hour).padStart(2, '0')}
                    </div>
                  )}
                  <button type="button" className="dtp-spin-btn" onClick={() => setSelectedTime((t) => ({ ...t, hour: (t.hour - 1 + 24) % 24 }))}>
                    <ChevronDownIcon />
                  </button>
                </div>
              </div>
              <span className="dtp-spin-separator">:</span>
              <div className="dtp-spinner">
                <span className="dtp-spinner-label">PHÚT</span>
                <div className="dtp-spinner-box">
                  <button type="button" className="dtp-spin-btn" onClick={() => setSelectedTime((t) => ({ ...t, minute: (t.minute + 1) % 60 }))}>
                    <ChevronUpIcon />
                  </button>
                  {editingField === 'minute' ? (
                    <input
                      className="dtp-spin-input"
                      type="text"
                      inputMode="numeric"
                      maxLength={2}
                      value={editingValue}
                      autoFocus
                      onChange={(e) => setEditingValue(e.target.value.replace(/\D/g, ''))}
                      onBlur={commitEditingValue}
                      onKeyDown={(e) => { if (e.key === 'Enter') commitEditingValue(); }}
                    />
                  ) : (
                    <div className="dtp-spin-value" onClick={() => { setEditingField('minute'); setEditingValue(String(selectedTime.minute).padStart(2, '0')); }}>
                      {String(selectedTime.minute).padStart(2, '0')}
                    </div>
                  )}
                  <button type="button" className="dtp-spin-btn" onClick={() => setSelectedTime((t) => ({ ...t, minute: (t.minute - 1 + 60) % 60 }))}>
                    <ChevronDownIcon />
                  </button>
                </div>
              </div>
            </div>
            <div className="dtp-quick">
              <div className="dtp-quick-label">CHỌN NHANH</div>
              <div className="dtp-quick-grid">
                {quickTimes.map((opt) => (
                  <button type="button" key={opt.label} className="dtp-quick-btn" onClick={() => setSelectedTime({ hour: opt.h, minute: opt.m })}>
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {errorMessage ? <div className="dtp-error-message">{errorMessage}</div> : null}

        <div className="dtp-footer">
          <button type="button" className="dtp-today-btn" onClick={handleToday}>Hôm nay</button>
          <button type="button" className="dtp-confirm-btn" onClick={handleConfirm}>Xác nhận</button>
        </div>
      </div>
    </div>
  );
}
