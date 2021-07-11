const temporaryStyle = document.createElement('style');
const colorSlider = document.getElementById('color');
const loginForm = document.getElementById('login-form');
const username = document.getElementById('username');

document.head.appendChild(temporaryStyle);

loginForm.onsubmit = (e) => {
  e.preventDefault();
  localStorage.setItem('username', username.value);
  localStorage.setItem('color', `hsl(${3.6 * colorSlider.value},60%,65%)`);
  window.location.replace('/');
};

function changeThumbColor() {
  const positionValue = (colorSlider.value / 100) * 360;
  const calculatedColor = `hsl(${positionValue}, 60%, 65%)`;
  temporaryStyle.textContent = `.input-color::-webkit-slider-thumb { background: ${calculatedColor}; }`;
}
changeThumbColor();
colorSlider.oninput = changeThumbColor;
