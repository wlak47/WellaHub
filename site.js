const desktop = document.getElementById('demo');
const phone = document.getElementById('phone-preview');
document.querySelectorAll('[data-preview]').forEach((button) => button.addEventListener('click', () => {
  const isPhone = button.dataset.preview === 'phone';
  document.querySelectorAll('[data-preview]').forEach((item) => item.classList.toggle('selected', item === button));
  desktop.classList.toggle('hidden', isPhone);
  phone.classList.toggle('active', isPhone);
}));
