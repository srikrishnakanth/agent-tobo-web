document.addEventListener('DOMContentLoaded', function () {
  var btn = document.getElementById('calc');
  if (btn) btn.addEventListener('click', function () {
    var n = parseInt(document.getElementById('veh').value, 10) || 0;
    document.getElementById('out').textContent = 'About $' + (n * 18).toLocaleString() + ' per month on Regional.';
  });
});
