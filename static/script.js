window.addEventListener('load', function() {
  const numBars = 20;
  const bars = Array.from({ length: numBars }, () => document.createElement('div'));
  bars.forEach((bar, index) => {
    bar.className = 'bar';
    if (index % 2 === 1) {
      bar.classList.add('down');
    }
    bar.style.left = `${index * (window.innerWidth / numBars)}px`;
    bar.style.background = `rgba(255, 255, 255, ${1 - index / bars.length})`;
    bar.style.animationDelay = `${Math.random()}s`;
    document.body.appendChild(bar);
  });

  setTimeout(() => {
    document.body.classList.add('bar-wipe-animation');
  }, 0);

  setTimeout(() => {
    bars.forEach(bar => bar.remove());
  }, 2000);
});