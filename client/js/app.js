const API_BASE = '/api';

const state = {
  user: JSON.parse(localStorage.getItem('templeDarshanUser') || 'null'),
  token: localStorage.getItem('templeDarshanToken') || '',
  otpEmail: '',
  temples: [],
  selectedTemple: null,
  selectedMonth: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  selectedDate: null,
  selectedSlot: null,
  bookingDraft: {
    devotees: [{ fullName: '', age: '', gender: '', mobileNumber: '' }],
  },
  currentStep: 'temple',
  bookings: [],
  adminBookings: [],
  bookingSearch: '',
  confirmedBooking: null,
  paymentMessage: '',
  paymentStatus: '',
  paymentOrderId: '',
  paymentResponse: null,
  otpTimer: 60,
  otpTimerId: null,
  tabs: {
    upcoming: [],
    completed: [],
    cancelled: [],
  },
  activeTab: 'upcoming',
  slotsByDate: {},
};

const els = {};

document.addEventListener('DOMContentLoaded', () => {
  cacheElements();
  bindEvents();
  initializeView();
});

function cacheElements() {
  els.loginScreen = document.getElementById('loginScreen');
  els.homeScreen = document.getElementById('homeScreen');
  els.bookingScreen = document.getElementById('bookingScreen');
  els.myBookingsScreen = document.getElementById('myBookingsScreen');
  els.adminScreen = document.getElementById('adminScreen');
  els.passScreen = document.getElementById('passScreen');

  els.emailInput = document.getElementById('emailInput');
  els.loginForm = document.getElementById('loginForm');
  els.sendOtpBtn = document.getElementById('sendOtpBtn');
  els.loginError = document.getElementById('loginError');
  els.loginSuccess = document.getElementById('loginSuccess');
  els.otpSection = document.getElementById('otpSection');
  els.otpInput = document.getElementById('otpInput');
  els.verifyOtpBtn = document.getElementById('verifyOtpBtn');
  els.resendOtpBtn = document.getElementById('resendOtpBtn');
  els.editEmailBtn = document.getElementById('editEmailBtn');
  els.otpCountdown = document.getElementById('otpCountdown');
  els.otpMessage = document.getElementById('otpMessage');
  els.sentEmail = document.getElementById('sentEmail');

  els.templeGrid = document.getElementById('templeGrid');
  els.homeUserBadge = document.getElementById('homeUserBadge');
  els.bookingHeader = document.getElementById('bookingHeader');
  els.bookingProgress = document.getElementById('bookingProgress');
  els.bookingContent = document.getElementById('bookingContent');
  els.bookingsList = document.getElementById('bookingsList');
  els.bookingTabs = document.querySelectorAll('.tab-btn');
  els.adminStats = document.getElementById('adminStats');
  els.adminBookings = document.getElementById('adminBookings');
  els.bookingSearch = document.getElementById('bookingSearch');
  els.passCard = document.getElementById('passCard');
  els.addTempleForm = document.getElementById('addTempleForm');
  els.addSlotForm = document.getElementById('addSlotForm');
  els.slotTempleSelect = document.getElementById('slotTempleSelect');

  els.homeNavBtn = document.getElementById('homeNavBtn');
  els.bookingsNavBtn = document.getElementById('bookingsNavBtn');
  els.adminNavBtn = document.getElementById('adminNavBtn');
  els.logoutBtn = document.getElementById('logoutBtn');
}

function bindEvents() {
  els.loginForm.addEventListener('submit', handleSendOtp);
  els.verifyOtpBtn.addEventListener('click', handleVerifyOtp);
  els.resendOtpBtn.addEventListener('click', handleResendOtp);
  els.editEmailBtn.addEventListener('click', editEmail);
  els.homeNavBtn.addEventListener('click', () => showScreen('homeScreen'));
  els.bookingsNavBtn.addEventListener('click', () => {
    if (!state.token) return;
    fetchMyBookings();
    showScreen('myBookingsScreen');
  });
  els.adminNavBtn.addEventListener('click', () => {
    if (!state.token) return;
    fetchAdminDashboard();
    showScreen('adminScreen');
  });
  els.logoutBtn.addEventListener('click', logout);
  els.bookingSearch.addEventListener('input', handleBookingSearch);
  els.addTempleForm.addEventListener('submit', handleAddTemple);
  els.addSlotForm.addEventListener('submit', handleAddSlot);
  els.bookingTabs.forEach((button) => {
    button.addEventListener('click', () => {
      state.activeTab = button.dataset.tab;
      renderTabs();
      renderBookingCards();
    });
  });
}

function initializeView() {
  if (state.token && (!state.user || !state.user.email)) {
    logout();
    return;
  }
  showScreen(state.token ? 'homeScreen' : 'loginScreen');
  if (state.token) {
    loadTemples();
    renderUserBadge();
    updateNavigation();
    fetchMyBookings();
    if (state.user && state.user.role === 'admin') {
      fetchAdminDashboard();
    }
  } else {
    updateNavigation();
  }
}

function showScreen(screenName) {
  const screens = ['loginScreen', 'homeScreen', 'bookingScreen', 'myBookingsScreen', 'adminScreen', 'passScreen'];
  screens.forEach((screen) => {
    const element = document.getElementById(screen);
    if (element) {
      element.classList.toggle('active', screen === screenName);
    }
  });
}

function updateNavigation() {
  const authenticated = Boolean(state.token);
  els.homeNavBtn.classList.toggle('hidden', !authenticated);
  els.bookingsNavBtn.classList.toggle('hidden', !authenticated);
  els.adminNavBtn.classList.toggle('hidden', !(authenticated && state.user && state.user.role === 'admin'));
  els.logoutBtn.classList.toggle('hidden', !authenticated);
}

function renderUserBadge() {
  if (!state.user) {
    els.homeUserBadge.textContent = 'Guest';
    return;
  }

  const label = state.user.role === 'admin' ? `Admin • ${state.user.email}` : state.user.email;
  els.homeUserBadge.textContent = label;
}

function setMessage(type, text) {
  const target = type === 'error' ? els.loginError : els.loginSuccess;
  const hideTarget = type === 'error' ? els.loginSuccess : els.loginError;
  target.textContent = text;
  target.classList.remove('hidden');
  hideTarget.classList.add('hidden');
}

function clearMessages() {
  els.loginError.classList.add('hidden');
  els.loginSuccess.classList.add('hidden');
}

function startOtpCountdown(seconds = 60) {
  if (state.otpTimerId) {
    clearInterval(state.otpTimerId);
  }
  state.otpTimer = seconds;
  els.otpSection.classList.remove('hidden');
  els.resendOtpBtn.disabled = true;
  els.resendOtpBtn.classList.add('hidden');
  els.otpCountdown.textContent = `Resend OTP in ${formatCountdown(state.otpTimer)}`;
  state.otpTimerId = setInterval(() => {
    state.otpTimer -= 1;
    if (state.otpTimer <= 0) {
      clearInterval(state.otpTimerId);
      els.otpCountdown.textContent = '';
      els.resendOtpBtn.disabled = false;
      els.resendOtpBtn.classList.remove('hidden');
      return;
    }
    els.otpCountdown.textContent = `Resend OTP in ${formatCountdown(state.otpTimer)}`;
  }, 1000);
}

function formatCountdown(seconds) {
  const m = String(Math.floor(seconds / 60)).padStart(2, '0');
  const s = String(seconds % 60).padStart(2, '0');
  return `${m}:${s}`;
}

async function handleSendOtp(event) {
  event.preventDefault();
  clearMessages();

  const email = els.emailInput.value.trim().toLowerCase();
  if (!els.emailInput.validity.valid || !email) {
    els.emailInput.reportValidity();
    setMessage('error', 'Please enter a valid email address.');
    return;
  }

  await requestEmailOtp(email, false);
}

async function requestEmailOtp(email, isResend) {
  const button = isResend ? els.resendOtpBtn : els.sendOtpBtn;
  const buttonLabel = button.textContent;
  button.disabled = true;
  if (!isResend) {
    button.textContent = 'Sending…';
  }
  try {
    const response = await fetch(`${API_BASE}/auth/send-email-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });

    const data = await response.json();
    if (!response.ok) {
      if (data.retryAfterSeconds) {
        startOtpCountdown(data.retryAfterSeconds);
      }
      throw new Error(data.message || 'Unable to send OTP right now. Please check your email address and try again.');
    }

    state.otpEmail = email;
    els.sentEmail.textContent = email;
    els.loginForm.classList.add('hidden');
    els.otpMessage.textContent = 'This code is valid for 5 minutes.';
    startOtpCountdown(data.resendAfterSeconds || 60);
    setMessage('success', data.message);
  } catch (error) {
    setMessage('error', error.message === 'Failed to fetch' || error.message === 'fetch failed'
      ? 'Unable to send OTP right now. Please check your email address and try again.'
      : error.message);
  } finally {
    if (!isResend) {
      button.disabled = false;
      button.textContent = buttonLabel;
    } else if (state.otpTimer <= 0) {
      button.disabled = false;
    }
  }
}

async function handleVerifyOtp() {
  clearMessages();
  const otp = els.otpInput.value.trim();

  if (!state.otpEmail || !/^\d{6}$/.test(otp)) {
    setMessage('error', 'Enter the 6-digit verification code sent to your email.');
    return;
  }

  els.verifyOtpBtn.disabled = true;
  try {
    const response = await fetch(`${API_BASE}/auth/verify-email-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: state.otpEmail, otp }),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.message || 'Invalid OTP. Please try again.');
    }

    state.token = data.token;
    state.user = data.user;
    localStorage.setItem('templeDarshanToken', state.token);
    localStorage.setItem('templeDarshanUser', JSON.stringify(state.user));
    renderUserBadge();
    updateNavigation();
    loadTemples();
    if (state.user.role === 'admin') {
      fetchAdminDashboard();
    }
    showScreen('homeScreen');
    setMessage('success', 'OTP verified successfully. Redirecting...');
    els.otpInput.value = '';
    state.otpEmail = '';
    if (state.otpTimerId) {
      clearInterval(state.otpTimerId);
    }
  } catch (error) {
    setMessage('error', error.message);
  } finally {
    els.verifyOtpBtn.disabled = false;
  }
}

function handleResendOtp() {
  clearMessages();
  if (state.otpEmail && !els.resendOtpBtn.disabled) {
    requestEmailOtp(state.otpEmail, true);
  }
}

function editEmail() {
  if (state.otpTimerId) {
    clearInterval(state.otpTimerId);
    state.otpTimerId = null;
  }
  state.otpEmail = '';
  els.otpInput.value = '';
  els.otpSection.classList.add('hidden');
  els.loginForm.classList.remove('hidden');
  els.emailInput.focus();
  clearMessages();
}

async function loadTemples() {
  try {
    const response = await fetch(`${API_BASE}/temples`);
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.message || 'Unable to load temples.');
    }

    state.temples = data.temples || [];
    renderTempleCards();

    if (state.temples.length) {
      els.slotTempleSelect.innerHTML = state.temples
        .map((temple) => `<option value="${temple._id}">${temple.name}</option>`)
        .join('');
    }
  } catch (error) {
    console.error(error);
  }
}

function renderTempleCards() {
  els.templeGrid.innerHTML = state.temples.map((temple) => `
    <article class="temple-card">
      <img src="${temple.image}" alt="${temple.imageAlt || `${temple.name} in ${temple.location}`}" loading="lazy" decoding="async" />
      <div class="temple-card-body">
        <h3>${temple.name}</h3>
        <div class="temple-meta">${temple.location}</div>
        <p>${temple.description}</p>
        <button class="primary-btn" data-temple-id="${temple._id}">Book Tickets</button>
      </div>
    </article>
  `).join('');

  els.templeGrid.querySelectorAll('[data-temple-id]').forEach((button) => {
    button.addEventListener('click', () => {
      const selected = state.temples.find((t) => t._id === button.dataset.templeId);
      startBookingFlow(selected);
    });
  });
}

function startBookingFlow(temple) {
  state.selectedTemple = temple;
  state.selectedDate = null;
  state.selectedSlot = null;
  state.currentStep = 'temple';
  state.bookingDraft = {
    devotees: [{ fullName: '', age: '', gender: '', mobileNumber: '' }],
  };
  state.paymentMessage = '';
  state.paymentStatus = '';
  state.paymentOrderId = '';
  state.paymentResponse = null;
  renderBookingScreen();
  fetchTempleSlots(temple._id);
}

async function fetchTempleSlots(templeId) {
  try {
    const response = await fetch(`${API_BASE}/slots?templeId=${templeId}`);
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.message || 'Unable to fetch slots');
    }
    const items = data.slots || [];
    const map = {};
    items.forEach((slot) => {
      map[slot.date] = map[slot.date] || [];
      map[slot.date].push(slot);
    });
    state.slotsByDate = map;
    if (state.selectedDate) {
      renderBookingScreen();
    }
  } catch (error) {
    console.error(error);
  }
}

function renderBookingScreen() {
  showScreen('bookingScreen');

  if (!state.selectedTemple) {
    return;
  }

  const title = state.selectedTemple.name;
  const image = state.selectedTemple.image;
  const imageAlt = state.selectedTemple.imageAlt || `${title} in ${state.selectedTemple.location}`;
  const location = state.selectedTemple.location;

  els.bookingHeader.innerHTML = `
    <img src="${image}" alt="${imageAlt}" loading="lazy" decoding="async" />
    <div class="booking-header-content">
      <p class="eyebrow">Selected Temple</p>
      <h3>${title}</h3>
      <p>${location}</p>
    </div>
  `;

  const steps = [
    { key: 'temple', label: 'Temple' },
    { key: 'date', label: 'Date' },
    { key: 'time', label: 'Time' },
    { key: 'details', label: 'Details' },
    { key: 'summary', label: 'Summary' },
    { key: 'payment', label: 'Payment' },
    { key: 'confirmation', label: 'Confirmation' },
    { key: 'pass', label: 'Pass' },
  ];

  const currentIndex = steps.findIndex((step) => step.key === state.currentStep);
  els.bookingProgress.innerHTML = steps.map((step, index) => {
    let className = 'progress-step';
    if (index < currentIndex) className += ' done';
    if (index === currentIndex) className += ' active';
    return `<div class="${className}">${index + 1}<br>${step.label}</div>`;
  }).join('');

  if (state.currentStep === 'temple') {
    els.bookingContent.innerHTML = `
      <div class="summary-box">
        <div class="summary-grid">
          <div class="summary-item">
            <span class="label">Temple</span>
            <span class="value">${state.selectedTemple.name}</span>
          </div>
          <div class="summary-item">
            <span class="label">Location</span>
            <span class="value">${state.selectedTemple.location}</span>
          </div>
        </div>
      </div>
      <div class="pass-actions" style="margin-top: 18px;">
        <button class="primary-btn" id="continueToDateBtn">Continue to Calendar</button>
      </div>
    `;
    document.getElementById('continueToDateBtn').addEventListener('click', () => {
      state.currentStep = 'date';
      renderBookingScreen();
    });
    return;
  }

  if (state.currentStep === 'date') {
    renderCalendarStep();
    return;
  }

  if (state.currentStep === 'time') {
    renderTimeStep();
    return;
  }

  if (state.currentStep === 'details') {
    renderDetailsStep();
    return;
  }

  if (state.currentStep === 'summary') {
    renderSummaryStep();
    return;
  }

  if (state.currentStep === 'payment') {
    renderPaymentStep();
    return;
  }

  if (state.currentStep === 'confirmation') {
    renderBookingConfirmation();
    return;
  }

  if (state.currentStep === 'pass') {
    renderPassState();
  }
}

function renderCalendarStep() {
  const monthLabel = state.selectedMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const firstDay = new Date(state.selectedMonth.getFullYear(), state.selectedMonth.getMonth(), 1);
  const daysInMonth = new Date(state.selectedMonth.getFullYear(), state.selectedMonth.getMonth() + 1, 0).getDate();
  const startingIndex = firstDay.getDay();
  const previousMonthDays = new Date(state.selectedMonth.getFullYear(), state.selectedMonth.getMonth(), 0).getDate();

  const cells = [];
  for (let i = 0; i < startingIndex; i += 1) {
    const dayNumber = previousMonthDays - startingIndex + i + 1;
    cells.push(`<div class="day-cell disabled"><span class="day-number">${dayNumber}</span><span class="day-dot unavailable"></span></div>`);
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = new Date(state.selectedMonth.getFullYear(), state.selectedMonth.getMonth(), day);
    const iso = toISODate(date);
    const status = getDayStatus(date);
    const selectedClass = state.selectedDate === iso ? 'selected' : '';
    cells.push(`
      <button class="day-cell ${status} ${selectedClass}" data-date="${iso}" ${status === 'unavailable' ? 'disabled' : ''}>
        <span class="day-number">${day}</span>
        <span class="day-dot"></span>
      </button>
    `);
  }

  while (cells.length % 7 !== 0) {
    const extraNumber = cells.length % 7 + 1;
    cells.push(`<div class="day-cell disabled"><span class="day-number">${extraNumber}</span><span class="day-dot unavailable"></span></div>`);
  }

  els.bookingContent.innerHTML = `
    <div class="calendar-month-row">
      <button class="secondary-btn" id="prevMonthBtn">← Previous</button>
      <h3>${monthLabel}</h3>
      <button class="secondary-btn" id="nextMonthBtn">Next →</button>
    </div>
    <div class="calendar-grid">
      <div class="weekday">Mon</div>
      <div class="weekday">Tue</div>
      <div class="weekday">Wed</div>
      <div class="weekday">Thu</div>
      <div class="weekday">Fri</div>
      <div class="weekday">Sat</div>
      <div class="weekday">Sun</div>
      ${cells.join('')}
    </div>
  `;

  document.getElementById('prevMonthBtn').addEventListener('click', () => {
    state.selectedMonth = new Date(state.selectedMonth.getFullYear(), state.selectedMonth.getMonth() - 1, 1);
    renderBookingScreen();
  });

  document.getElementById('nextMonthBtn').addEventListener('click', () => {
    state.selectedMonth = new Date(state.selectedMonth.getFullYear(), state.selectedMonth.getMonth() + 1, 1);
    renderBookingScreen();
  });

  els.bookingContent.querySelectorAll('[data-date]').forEach((cell) => {
    cell.addEventListener('click', () => {
      const selectedDate = cell.dataset.date;
      const dateObj = new Date(`${selectedDate}T00:00:00`);
      if (dateObj < new Date(new Date().setHours(0, 0, 0, 0))) {
        return;
      }
      state.selectedDate = selectedDate;
      state.currentStep = 'time';
      renderBookingScreen();
    });
  });
}

function getDayStatus(dateObj) {
  const iso = toISODate(dateObj);
  if (dateObj < new Date(new Date().setHours(0, 0, 0, 0))) {
    return 'unavailable';
  }

  const slots = state.slotsByDate[iso] || [];
  if (!slots.length) {
    return 'unavailable';
  }
  const remaining = slots.reduce((total, slot) => total + Math.max(0, slot.capacity - slot.bookedCount), 0);
  if (remaining <= 0) return 'full';
  if (remaining < 30) return 'few';
  return 'available';
}

function renderTimeStep() {
  const slots = state.slotsByDate[state.selectedDate] || [];
  if (!slots.length) {
    els.bookingContent.innerHTML = '<p>No slots available.</p>';
    return;
  }

  const sortedSlots = [...slots].sort((a, b) => a.timeStart.localeCompare(b.timeStart));
  els.bookingContent.innerHTML = `
    <div class="slot-grid">
      ${sortedSlots.map((slot) => {
        const remaining = Math.max(0, slot.capacity - slot.bookedCount);
        const status = remaining <= 0 ? 'full' : remaining <= 8 ? 'few' : 'available';
        return `
          <button class="slot-card ${status}" data-slot-id="${slot._id}">
            <div class="slot-time">${slot.timeLabel}</div>
            <div class="slot-meta">${slot.capacity} total capacity</div>
            <div class="slot-meta">${slot.bookedCount} booked</div>
            <div class="slot-remaining">${remaining <= 0 ? 'Fully Booked' : `${remaining} slots available`}</div>
          </button>
        `;
      }).join('')}
    </div>
  `;

  els.bookingContent.querySelectorAll('[data-slot-id]').forEach((button) => {
    button.addEventListener('click', () => {
      const slotId = button.dataset.slotId;
      const slot = sortedSlots.find((item) => item._id === slotId);
      if (!slot) return;
      if (slot.capacity - slot.bookedCount <= 0) {
        return;
      }
      state.selectedSlot = slot;
      state.currentStep = 'details';
      renderBookingScreen();
    });
  });
}

function renderDetailsStep() {
  const count = state.bookingDraft.devotees.length;
  els.bookingContent.innerHTML = `
    <form id="bookingDetailsForm" class="devotee-form">
      <div class="field-group">
        <label>Number of Devotees</label>
        <div class="qty-control">
          <button class="qty-btn" type="button" id="decreaseDevoteesBtn" aria-label="Remove one devotee">−</button>
          <span class="qty-value" id="devoteeCountValue">${count}</span>
          <button class="qty-btn" type="button" id="increaseDevoteesBtn" aria-label="Add one devotee">+</button>
        </div>
      </div>
      <div id="devoteeForms" class="devotee-list">
        ${state.bookingDraft.devotees.map((devotee, index) => `
          <section class="devotee-entry">
            <h3>Devotee ${index + 1}</h3>
            <div class="field-group">
              <label for="devoteeName${index}">Full Name</label>
              <input id="devoteeName${index}" name="fullName" data-devotee-index="${index}" value="${escapeHtml(devotee.fullName)}" maxlength="100" autocomplete="name" placeholder="Enter full name" required />
            </div>
            <div class="input-row">
              <div class="field-group">
                <label for="devoteeAge${index}">Age</label>
                <input id="devoteeAge${index}" name="age" data-devotee-index="${index}" type="number" min="0" max="120" step="1" value="${escapeHtml(String(devotee.age))}" placeholder="Age" required />
              </div>
              <div class="field-group">
                <label for="devoteeGender${index}">Gender</label>
                <select id="devoteeGender${index}" name="gender" data-devotee-index="${index}" required>
                  <option value="">Select gender</option>
                  ${['Female', 'Male', 'Other'].map((gender) => `<option value="${gender}" ${devotee.gender === gender ? 'selected' : ''}>${gender}</option>`).join('')}
                </select>
              </div>
            </div>
            <div class="field-group">
              <label for="devoteeMobile${index}">Mobile Number</label>
              <input id="devoteeMobile${index}" name="mobileNumber" data-devotee-index="${index}" type="tel" inputmode="tel" pattern="[+]?[0-9]{10,15}" value="${escapeHtml(devotee.mobileNumber)}" placeholder="10–15 digits" title="Enter 10 to 15 digits, optionally beginning with +" required />
            </div>
          </section>
        `).join('')}
      </div>
      <p id="devoteeValidationMessage" class="message error hidden" role="alert"></p>
      <div class="pass-actions">
        <button class="primary-btn" type="submit">Continue to Summary</button>
        <button class="secondary-btn" type="button" id="backToSlotsBtn">Back to time slots</button>
      </div>
    </form>
  `;

  const syncDraft = (event) => {
    const input = event.target;
    if (!input.matches('[data-devotee-index]')) return;
    const index = Number(input.dataset.devoteeIndex);
    state.bookingDraft.devotees[index][input.name] = input.name === 'age' ? input.value : input.value.trim();
  };
  const devoteeForms = document.getElementById('devoteeForms');
  devoteeForms.addEventListener('input', syncDraft);
  devoteeForms.addEventListener('change', syncDraft);

  document.getElementById('increaseDevoteesBtn').addEventListener('click', () => {
    if (state.bookingDraft.devotees.length >= 12) return;
    state.bookingDraft.devotees.push({ fullName: '', age: '', gender: '', mobileNumber: '' });
    renderDetailsStep();
  });
  document.getElementById('decreaseDevoteesBtn').addEventListener('click', () => {
    if (state.bookingDraft.devotees.length <= 1) return;
    state.bookingDraft.devotees.pop();
    renderDetailsStep();
  });
  document.getElementById('backToSlotsBtn').addEventListener('click', () => {
    state.currentStep = 'time';
    renderBookingScreen();
  });
  document.getElementById('bookingDetailsForm').addEventListener('submit', (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    const devotees = Array.from(form.querySelectorAll('.devotee-entry')).map((entry) => ({
      fullName: entry.querySelector('[name="fullName"]').value.trim(),
      age: Number(entry.querySelector('[name="age"]').value),
      gender: entry.querySelector('[name="gender"]').value,
      mobileNumber: entry.querySelector('[name="mobileNumber"]').value.trim(),
    }));
    const remaining = state.selectedSlot.capacity - state.selectedSlot.bookedCount;
    const invalidIndex = devotees.findIndex((devotee) => (
      devotee.fullName.length < 2
      || !Number.isInteger(devotee.age)
      || devotee.age < 0
      || devotee.age > 120
      || !['Female', 'Male', 'Other'].includes(devotee.gender)
      || !/^\+?[0-9]{10,15}$/.test(devotee.mobileNumber)
      || /^0+$/.test(devotee.mobileNumber.replace(/\D/g, ''))
    ));
    const validationMessage = document.getElementById('devoteeValidationMessage');
    if (invalidIndex !== -1) {
      validationMessage.textContent = `Check the required details for Devotee ${invalidIndex + 1}.`;
      validationMessage.classList.remove('hidden');
      return;
    }
    if (devotees.length > remaining) {
      validationMessage.textContent = `Only ${remaining} slots are available for this time.`;
      validationMessage.classList.remove('hidden');
      return;
    }
    state.bookingDraft.devotees = devotees;
    state.paymentMessage = '';
    state.currentStep = 'summary';
    renderBookingScreen();
  });
}

function renderSummaryStep() {
  const devotees = state.bookingDraft.devotees;
  const totalAmount = devotees.length * 100;
  els.bookingContent.innerHTML = `
    <div class="summary-box">
      <div class="summary-grid">
        <div class="summary-item"><span class="label">Temple</span><span class="value">${escapeHtml(state.selectedTemple.name)}</span></div>
        <div class="summary-item"><span class="label">Location</span><span class="value">${escapeHtml(state.selectedTemple.location)}</span></div>
        <div class="summary-item"><span class="label">Date</span><span class="value">${formatDisplayDate(state.selectedDate)}</span></div>
        <div class="summary-item"><span class="label">Darshan Time</span><span class="value">${escapeHtml(state.selectedSlot.timeLabel)}</span></div>
        <div class="summary-item"><span class="label">Number of Devotees</span><span class="value">${devotees.length}</span></div>
        <div class="summary-item"><span class="label">Amount per Devotee</span><span class="value">${formatINR(100)}</span></div>
        <div class="summary-item"><span class="label">Total Amount</span><span class="value">${formatINR(totalAmount)}</span></div>
      </div>
    </div>
    <h3>Review Devotees</h3>
    <div class="devotee-summary-list">
      ${devotees.map((devotee, index) => `
        <article class="devotee-summary">
          <h4>Devotee ${index + 1}: ${escapeHtml(devotee.fullName)}</h4>
          <p>Age: ${devotee.age} · Gender: ${escapeHtml(devotee.gender)}</p>
          <p>Mobile: ${escapeHtml(devotee.mobileNumber)}</p>
        </article>
      `).join('')}
    </div>
    <p id="paymentMessage" class="message error ${state.paymentMessage ? '' : 'hidden'}" role="alert">${escapeHtml(state.paymentMessage)}</p>
    <div class="pass-actions">
      <button class="primary-btn" id="proceedToPaymentBtn">Proceed to Payment</button>
      <button class="secondary-btn" id="backToDetailsBtn">Back</button>
    </div>
  `;
  document.getElementById('proceedToPaymentBtn').addEventListener('click', startRazorpayPayment);
  document.getElementById('backToDetailsBtn').addEventListener('click', () => {
    state.currentStep = 'details';
    renderBookingScreen();
  });
}

function renderPaymentStep() {
  els.bookingContent.innerHTML = `
    <div class="summary-box">
      <h3>Razorpay Test Checkout</h3>
      <p>${state.paymentMessage ? escapeHtml(state.paymentMessage) : 'Complete the secure test payment in Razorpay Checkout. Your booking is not confirmed until the backend verifies payment.'}</p>
      <p><strong>Amount:</strong> ${formatINR(state.bookingDraft.devotees.length * 100)}</p>
      <p><strong>Status:</strong> ${state.paymentStatus || 'PAYMENT_PENDING'}</p>
    </div>
    <div class="pass-actions">
      <button class="primary-btn" id="retryPaymentBtn">Retry Payment</button>
      <button class="secondary-btn" id="backToSummaryBtn">Back to Summary</button>
    </div>
  `;
  document.getElementById('retryPaymentBtn').addEventListener('click', startRazorpayPayment);
  document.getElementById('backToSummaryBtn').addEventListener('click', () => {
    state.currentStep = 'summary';
    renderBookingScreen();
  });
}

async function startRazorpayPayment() {
  const buttonId = state.currentStep === 'payment' ? 'retryPaymentBtn' : 'proceedToPaymentBtn';
  const button = document.getElementById(buttonId);
  if (button) button.disabled = true;
  try {
    if (state.paymentResponse) {
      await verifyCurrentPayment();
      return;
    }
    const config = await fetchJSON(`${API_BASE}/bookings/payment/config`, {
      headers: { Authorization: `Bearer ${state.token}` },
    });
    if (!config.configured) {
      throw new Error('Razorpay Test Mode credentials are not configured on the server yet.');
    }
    if (!window.Razorpay) {
      throw new Error('Razorpay Checkout could not be loaded. Check your internet connection and retry.');
    }
    const order = await fetchJSON(`${API_BASE}/bookings/payment/order`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${state.token}` },
      body: JSON.stringify({
        templeId: state.selectedTemple._id,
        date: state.selectedDate,
        slotId: state.selectedSlot._id,
        devotees: state.bookingDraft.devotees,
      }),
    });
    state.paymentOrderId = order.orderId;
    state.paymentMessage = '';
    state.paymentStatus = 'PAYMENT_PENDING';
    state.currentStep = 'payment';
    renderBookingScreen();

    const checkout = new window.Razorpay({
      key: order.keyId,
      amount: order.amountInPaise,
      currency: order.currency,
      name: 'Temple Darshan',
      description: `Darshan for ${state.bookingDraft.devotees.length} devotee(s)`,
      order_id: order.orderId,
      prefill: { email: state.user?.email || '' },
      config: {
        display: {
          blocks: {
            upi: {
              name: 'Pay by UPI',
              instruments: [{ method: 'upi' }],
            },
          },
          sequence: ['block.upi'],
          preferences: { show_default_blocks: true },
        },
      },
      theme: { color: '#d7a74a' },
      handler: async (paymentResponse) => {
        state.paymentResponse = paymentResponse;
        state.paymentOrderId = '';
        await verifyCurrentPayment();
      },
      modal: {
        ondismiss: () => closePaymentAttempt('Payment checkout was cancelled. The booking is not confirmed.'),
      },
    });
    checkout.on('payment.failed', () => {
      state.paymentResponse = null;
      closePaymentAttempt('Payment failed. The booking is not confirmed. You can retry.', 'failed');
    });
    checkout.open();
  } catch (error) {
    state.paymentMessage = error.message || 'Unable to start payment. Please try again.';
    if (state.currentStep === 'summary') renderSummaryStep();
    else renderPaymentStep();
  } finally {
    if (button && button.isConnected) button.disabled = false;
  }
}

async function verifyCurrentPayment() {
  try {
    const verified = await fetchJSON(`${API_BASE}/bookings/payment/verify`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${state.token}` },
      body: JSON.stringify(state.paymentResponse),
    });
    state.confirmedBooking = verified.booking;
    state.paymentMessage = '';
    state.paymentStatus = 'PAID';
    state.paymentOrderId = '';
    state.paymentResponse = null;
    state.currentStep = 'confirmation';
    renderBookingScreen();
  } catch (error) {
    if ([400, 402, 409, 410].includes(error.status)) {
      state.paymentResponse = null;
    }
    if (error.status === 402) {
      state.paymentStatus = 'PAYMENT_FAILED';
    }
    state.paymentMessage = error.message || 'Payment verification failed. The booking is not confirmed.';
    renderPaymentStep();
  }
}

async function closePaymentAttempt(message, status = 'cancelled') {
  const orderId = state.paymentOrderId;
  if (!orderId) return;
  state.paymentOrderId = '';
  state.paymentResponse = null;
  if (orderId) {
    try {
      await fetchJSON(`${API_BASE}/bookings/payment/cancel`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${state.token}` },
        body: JSON.stringify({ orderId, status }),
      });
    } catch (error) {
      console.error('Unable to close pending payment:', error.message);
    }
  }
  state.paymentMessage = message;
  state.paymentStatus = status === 'failed' ? 'PAYMENT_FAILED' : 'PAYMENT_PENDING';
  state.currentStep = 'payment';
  renderBookingScreen();
}

function renderBookingConfirmation() {
  const booking = state.confirmedBooking;
  els.bookingContent.innerHTML = `
    <div class="summary-box payment-confirmed">
      <h3>Payment Verified — Booking Confirmed</h3>
      <p>Booking ID: <strong>${escapeHtml(booking.bookingId)}</strong></p>
      <p>Payment: <strong>PAID</strong> · Booking: <strong>CONFIRMED</strong></p>
      <p>Total: <strong>${formatINR(booking.amount)}</strong></p>
    </div>
    <div class="pass-actions">
      <button class="primary-btn" id="continueToPassBtn">View Digital Darshan Pass</button>
      <button class="secondary-btn" id="confirmationMyBookingsBtn">My Bookings</button>
    </div>
  `;
  document.getElementById('continueToPassBtn').addEventListener('click', () => {
    state.currentStep = 'pass';
    renderPassState();
  });
  document.getElementById('confirmationMyBookingsBtn').addEventListener('click', () => {
    fetchMyBookings();
    showScreen('myBookingsScreen');
  });
}

function renderPassState() {
  showScreen('passScreen');

  const booking = state.confirmedBooking;
  if (!booking || booking.paymentStatus !== 'paid' || booking.status !== 'confirmed') {
    state.currentStep = 'payment';
    state.paymentMessage = 'A paid and verified booking is required to view a darshan pass.';
    renderBookingScreen();
    return;
  }
  const temple = booking.templeId && typeof booking.templeId === 'object' ? booking.templeId : state.selectedTemple;
  const templeName = temple?.name || 'Temple Darshan';
  const location = temple?.location || '';
  const devotees = booking.devotees?.length
    ? booking.devotees
    : [{ fullName: booking.devoteeName, age: '-', gender: '-', mobileNumber: booking.mobileNumber }];

  els.passCard.innerHTML = `
    <div class="pass-card">
      <div class="pass-top">
        <div>
          <div class="eyebrow">Temple Darshan Pass</div>
          <div class="pass-title">${escapeHtml(templeName)}</div>
          <p>${escapeHtml(location)}</p>
        </div>
        <img class="pass-qr" src="${booking.qrCode || ''}" alt="Scannable booking verification QR code" />
      </div>
      ${temple?.image ? `<img class="pass-temple-image" src="${escapeHtml(temple.image)}" alt="${escapeHtml(temple.imageAlt || `${templeName} in ${location}`)}" />` : ''}
      <div class="pass-grid">
        <div class="pass-item"><span class="label">Booking ID</span><span class="value">${escapeHtml(booking.bookingId)}</span></div>
        <div class="pass-item"><span class="label">Date</span><span class="value">${formatDisplayDate(booking.date)}</span></div>
        <div class="pass-item"><span class="label">Darshan Time</span><span class="value">${escapeHtml(booking.timeSlot)}</span></div>
        <div class="pass-item"><span class="label">Entry Time</span><span class="value">${escapeHtml(formatEntryTime(booking.slotId?.timeStart, booking.timeSlot))}</span></div>
        <div class="pass-item"><span class="label">Number of Devotees</span><span class="value">${booking.numberOfDevotees}</span></div>
        <div class="pass-item"><span class="label">Total Amount</span><span class="value">${formatINR(booking.amount)}</span></div>
        <div class="pass-item"><span class="label">Payment Status</span><span class="value">PAID</span></div>
        <div class="pass-item"><span class="label">Booking Status</span><span class="value">CONFIRMED</span></div>
      </div>
      <section class="entry-gate-card" aria-label="Assigned entry gate">
        <div>
          <div class="eyebrow">Your Entry Gate</div>
          <div class="entry-gate-name">${escapeHtml(booking.entryGate || 'Gate assignment unavailable')}</div>
          <p>Arrive at ${escapeHtml(formatEntryTime(booking.slotId?.timeStart, booking.timeSlot))} for your selected darshan slot.</p>
        </div>
        <div class="entry-gate-visual" role="img" aria-label="Illustrative entry gate">
          <div class="entry-gate-arch" aria-hidden="true"></div>
        </div>
      </section>
      <div class="status-list" aria-label="Pass verification status">
        <span class="status-chip">✓ PAYMENT VERIFIED</span>
        <span class="status-chip">✓ BOOKING CONFIRMED</span>
        <span class="status-chip">✓ QR VERIFIED</span>
        <span class="status-chip">✓ VALID ENTRY PASS</span>
      </div>
      <h3>Devotees</h3>
      <ol class="pass-devotees">
        ${devotees.map((devotee) => `<li>${escapeHtml(devotee.fullName)}${Number.isInteger(devotee.age) ? ` · Age ${devotee.age}` : ''}${devotee.gender && devotee.gender !== '-' ? ` · ${escapeHtml(devotee.gender)}` : ''}</li>`).join('')}
      </ol>
      <div class="pass-actions">
        <button class="primary-btn" id="downloadPassBtn">Download Pass</button>
        <button class="secondary-btn" id="viewBookingsBtn">View My Bookings</button>
        <button class="secondary-btn" id="backHomeBtn">Back to Home</button>
      </div>
    </div>
  `;

  document.getElementById('downloadPassBtn').addEventListener('click', downloadPass);
  document.getElementById('viewBookingsBtn').addEventListener('click', () => {
    fetchMyBookings();
    showScreen('myBookingsScreen');
  });
  document.getElementById('backHomeBtn').addEventListener('click', () => {
    showScreen('homeScreen');
  });
}

async function downloadPass(booking = state.confirmedBooking) {
  if (!booking || !booking._id) {
    alert('The confirmed booking could not be loaded.');
    return;
  }

  try {
    const response = await fetch(`${API_BASE}/bookings/${booking._id}/pass.pdf`, {
      headers: { Authorization: `Bearer ${state.token}` },
    });
    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.message || 'Unable to download the pass.');
    }
    const objectUrl = URL.createObjectURL(await response.blob());
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = `Temple-Darshan-Pass-${booking.bookingId}.pdf`;
    link.click();
    URL.revokeObjectURL(objectUrl);
  } catch (error) {
    alert(error.message || 'Unable to download the pass. Please try again.');
  }
}

async function fetchMyBookings() {
  if (!state.token) return;
  try {
    const response = await fetch(`${API_BASE}/bookings/my`, {
      headers: {
        Authorization: `Bearer ${state.token}`,
      },
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.message || 'Unable to fetch bookings.');
    }

    state.bookings = data.bookings || [];
    renderTabs();
    renderBookingCards();
  } catch (error) {
    console.error(error);
  }
}

function renderTabs() {
  state.tabs = {
    upcoming: state.bookings.filter((booking) => booking.status === 'confirmed' && booking.paymentStatus === 'paid'),
    completed: state.bookings.filter((booking) => booking.status === 'completed' && booking.paymentStatus === 'paid'),
    cancelled: state.bookings.filter((booking) => booking.status === 'cancelled'),
  };

  els.bookingTabs.forEach((button) => {
    const isActive = button.dataset.tab === state.activeTab;
    button.classList.toggle('active', isActive);
  });
}

function renderBookingCards() {
  const list = state.tabs[state.activeTab] || [];
  if (!list.length) {
    els.bookingsList.innerHTML = `<div class="summary-box">No ${state.activeTab} bookings found.</div>`;
    return;
  }

  els.bookingsList.innerHTML = list.map((booking) => `
    <article class="booking-card">
      <div>
        <h4>${escapeHtml(booking.templeId?.name || 'Temple')}</h4>
        <p><strong>Location:</strong> ${escapeHtml(booking.templeId?.location || '-')}</p>
        <p><strong>Date:</strong> ${formatDisplayDate(booking.date)}</p>
        <p><strong>Time:</strong> ${escapeHtml(booking.timeSlot)}</p>
        <p><strong>Entry gate:</strong> ${escapeHtml(booking.entryGate || '-')}</p>
        <p><strong>Devotees:</strong> ${booking.numberOfDevotees}</p>
        <p><strong>Devotee names:</strong> ${escapeHtml((booking.devotees || []).map((devotee) => devotee.fullName).join(', ') || booking.devoteeName || '-')}</p>
        <p><strong>Total:</strong> ${formatINR(booking.amount || 0)}</p>
        <p><strong>Booking ID:</strong> ${escapeHtml(booking.bookingId)}</p>
      </div>
      <div>
        <span class="status-pill ${escapeHtml(booking.status)}">${escapeHtml(booking.status)}</span>
        <p><strong>Payment:</strong> ${escapeHtml(booking.paymentStatus || 'paid')}</p>
      </div>
      <div class="booking-actions">
        <button class="primary-btn" data-booking-view="${booking._id}">View Pass</button>
        <button class="secondary-btn" data-booking-download="${booking._id}">Download Pass</button>
        ${booking.status === 'confirmed' && booking.paymentStatus === 'paid' ? `<button class="secondary-btn" data-booking-cancel="${booking._id}">Cancel Booking</button>` : ''}
      </div>
    </article>
  `).join('');

  els.bookingsList.querySelectorAll('[data-booking-view]').forEach((button) => {
    button.addEventListener('click', async () => {
      const bookingId = button.dataset.bookingView;
      const response = await fetch(`${API_BASE}/bookings/${bookingId}`, {
        headers: { Authorization: `Bearer ${state.token}` },
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Unable to fetch booking.');
      const booking = data.booking;
      state.confirmedBooking = { ...booking, qrCode: booking.qrCode || '' };
      state.selectedTemple = booking.templeId;
      state.selectedDate = booking.date;
      state.selectedSlot = { timeLabel: booking.timeSlot };
      state.bookingDraft = {
        devotees: booking.devotees?.length
          ? booking.devotees
          : [{ fullName: booking.devoteeName || '', age: '', gender: '', mobileNumber: booking.mobileNumber || '' }],
      };
      state.currentStep = 'pass';
      renderPassState();
    });
  });

  els.bookingsList.querySelectorAll('[data-booking-download]').forEach((button) => {
    button.addEventListener('click', async () => {
      const booking = list.find((entry) => entry._id === button.dataset.bookingDownload);
      if (booking) await downloadPass(booking);
    });
  });

  els.bookingsList.querySelectorAll('[data-booking-cancel]').forEach((button) => {
    button.addEventListener('click', async () => {
      const bookingId = button.dataset.bookingCancel;
      await cancelBooking(bookingId);
    });
  });
}

async function cancelBooking(bookingId) {
  try {
    const response = await fetch(`${API_BASE}/bookings/${bookingId}/cancel`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${state.token}` },
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.message || 'Unable to cancel booking.');
    }
    await fetchMyBookings();
    alert('Booking cancelled successfully.');
  } catch (error) {
    alert(error.message);
  }
}

async function fetchAdminDashboard() {
  if (!state.token || !state.user || state.user.role !== 'admin') {
    return;
  }

  try {
    const [statsResponse, bookingsResponse] = await Promise.all([
      fetch(`${API_BASE}/admin/stats`, {
        headers: { Authorization: `Bearer ${state.token}` },
      }),
      fetch(`${API_BASE}/admin/bookings`, {
        headers: { Authorization: `Bearer ${state.token}` },
      }),
    ]);

    const stats = await statsResponse.json();
    const bookings = await bookingsResponse.json();

    if (!statsResponse.ok || !bookingsResponse.ok) {
      throw new Error('Unable to load admin dashboard.');
    }

    state.adminBookings = bookings.bookings || [];
    renderAdminStats(stats.stats || {});
    renderAdminBookings();
  } catch (error) {
    console.error(error);
  }
}

function renderAdminStats(stats) {
  const cards = [
    { label: 'Total Temples', value: stats.totalTemples || 0 },
    { label: "Today's Bookings", value: stats.todaysBookings || 0 },
    { label: 'Upcoming Bookings', value: stats.upcomingBookings || 0 },
    { label: 'Available Slots', value: stats.availableSlots || 0 },
    { label: 'Completed Bookings', value: stats.completedBookings || 0 },
    { label: 'Cancelled Bookings', value: stats.cancelledBookings || 0 },
  ];

  els.adminStats.innerHTML = cards.map((card) => `
    <div class="stat-card">
      <p>${card.label}</p>
      <strong>${card.value}</strong>
    </div>
  `).join('');
}

function renderAdminBookings() {
  const query = (state.bookingSearch || '').toLowerCase();
  const filtered = state.adminBookings.filter((booking) => {
    const names = (booking.devotees || []).map((devotee) => devotee.fullName).join(' ');
    const text = `${booking.bookingId} ${names} ${booking.devoteeName || ''} ${booking.templeId?.name || ''} ${booking.userId?.email || ''}`.toLowerCase();
    return text.includes(query);
  });

  els.adminBookings.innerHTML = `
    <table class="booking-table">
      <thead>
        <tr>
          <th>Booking ID</th>
          <th>Temple</th>
          <th>Location</th>
          <th>Date</th>
          <th>Time</th>
          <th>Devotees</th>
          <th>Total</th>
          <th>Payment</th>
          <th>Booking</th>
          <th>Razorpay reference</th>
        </tr>
      </thead>
      <tbody>
        ${filtered.map((booking) => `
          <tr>
            <td>${escapeHtml(booking.bookingId)}</td>
            <td>${escapeHtml(booking.templeId?.name || '-')}</td>
            <td>${escapeHtml(booking.templeId?.location || '-')}</td>
            <td>${formatDisplayDate(booking.date)}</td>
            <td>${escapeHtml(booking.timeSlot)}</td>
            <td>${escapeHtml((booking.devotees || []).map((devotee) => devotee.fullName).join(', ') || booking.devoteeName || '-')} (${booking.numberOfDevotees})</td>
            <td>${formatINR(booking.amount || 0)}</td>
            <td>${escapeHtml(booking.paymentStatus || 'paid')}</td>
            <td><span class="status-pill ${escapeHtml(booking.status)}">${escapeHtml(booking.status)}</span></td>
            <td>${escapeHtml(booking.razorpayOrderId || '-')}<br>${escapeHtml(booking.razorpayPaymentId || '-')}</td>
          </tr>
        `).join('') || '<tr><td colspan="10">No bookings found.</td></tr>'}
      </tbody>
    </table>
  `;
}

function handleBookingSearch(event) {
  state.bookingSearch = event.target.value;
  renderAdminBookings();
}

async function handleAddTemple(event) {
  event.preventDefault();
  const formData = new FormData(event.target);
  const body = Object.fromEntries(formData.entries());

  try {
    const response = await fetch(`${API_BASE}/admin/temples`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${state.token}`,
      },
      body: JSON.stringify(body),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'Unable to add temple.');
    event.target.reset();
    await loadTemples();
    await fetchAdminDashboard();
    alert('Temple added successfully.');
  } catch (error) {
    alert(error.message);
  }
}

async function handleAddSlot(event) {
  event.preventDefault();
  const formData = new FormData(event.target);
  const body = Object.fromEntries(formData.entries());

  try {
    const response = await fetch(`${API_BASE}/admin/slots`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${state.token}`,
      },
      body: JSON.stringify({
        ...body,
        capacity: Number(body.capacity),
      }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'Unable to add slot.');
    event.target.reset();
    fetchAdminDashboard();
    alert('Slot created successfully.');
  } catch (error) {
    alert(error.message);
  }
}

async function logout() {
  state.token = '';
  state.user = null;
  state.selectedTemple = null;
  state.selectedDate = null;
  state.selectedSlot = null;
  state.confirmedBooking = null;
  localStorage.removeItem('templeDarshanToken');
  localStorage.removeItem('templeDarshanUser');
  clearMessages();
  showScreen('loginScreen');
  updateNavigation();
}

function toISODate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character]);
}

function formatINR(amount) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(Number(amount) || 0);
}

function formatDisplayDate(dateString) {
  if (!dateString) return '-';
  const date = new Date(`${dateString}T00:00:00`);
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function formatEntryTime(timeStart, timeSlot) {
  const start = timeStart || String(timeSlot || '').split(/\s*[–-]\s*/)[0];
  const match = /^(\d{1,2}):(\d{2})$/.exec(start.trim());
  if (!match) return start.trim() || '-';
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return start.trim();
  return `${hour % 12 || 12}:${match[2]} ${hour >= 12 ? 'PM' : 'AM'}`;
}

function getDayName(dateString) {
  if (!dateString) return '-';
  const date = new Date(`${dateString}T00:00:00`);
  return date.toLocaleDateString('en-US', { weekday: 'long' });
}

function fetchJSON(url, options = {}) {
  return fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  }).then(async (response) => {
    const data = await response.json();
    if (!response.ok) {
      const error = new Error(data.message || 'Request failed');
      error.status = response.status;
      throw error;
    }
    return data;
  });
}
