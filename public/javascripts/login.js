const username = document.getElementById('username');
const loginForm = document.getElementById('login-form');

loginForm.onsubmit = (e) => {
  e.preventDefault();
  if (username.reportValidity()) {
    localStorage.setItem('username', username.value);
    localStorage.setItem('color', `hsl(${360 * Math.random()},60%,65%)`);
    window.location.replace('/');
  }
};
